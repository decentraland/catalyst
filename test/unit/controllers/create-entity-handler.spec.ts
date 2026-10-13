import { Authenticator } from '@dcl/crypto'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { ServiceUnavailableError } from '../../../src/controllers/errors'
import { createUploadBudget, UploadBudgetExceededError } from '../../../src/adapters/upload-budget'
import { EnvironmentConfig } from '../../../src/Environment'
import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import { SpooledFile } from '../../../src/types'
import { DeploymentFileSource } from '../../../src/logic/deployment-service/types'

type Context = Parameters<typeof createEntity>[0]

const ENTITY_ID = 'bafkreigdj5jyzxnhfwpkkvslq4vadvyymyi6zgf4gdhsvjfqqmbzl7u7fi'

async function spool(folder: string, fieldname: string, content: string): Promise<SpooledFile> {
  const filePath = path.join(folder, fieldname)
  await writeFile(filePath, content)
  return {
    fieldname,
    filename: fieldname,
    encoding: '7bit',
    mimeType: 'application/octet-stream',
    path: filePath,
    size: content.length
  }
}

function buildContext(files: SpooledFile[], partial: boolean, components: Record<string, unknown>): Context {
  const authChain = Authenticator.createSimpleAuthChain(ENTITY_ID, '0x' + '1'.repeat(40), '0x' + 'a'.repeat(130))
  const fields: Record<string, any> = {
    entityId: { fieldname: 'entityId', value: ENTITY_ID },
    authChain: { fieldname: 'authChain', value: JSON.stringify(authChain) }
  }
  if (partial) {
    fields.partial = { fieldname: 'partial', value: 'true' }
  }
  return {
    request: { headers: { get: () => null } },
    formData: { fields, files: Object.fromEntries(files.map((file) => [file.fieldname, file])) },
    components: {
      logs: { getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
      metrics: { increment: jest.fn() },
      contentLocks: { withRead: (operation: () => Promise<unknown>) => operation() },
      crypto: { validateSignature: jest.fn().mockResolvedValue({ ok: true }) },
      ...components
    }
  } as unknown as Context
}

describe('when creating an entity from spooled upload files', () => {
  let folder: string
  let files: SpooledFile[]
  let lease: { resize: jest.Mock; release: jest.Mock }
  let deploymentMemoryBudget: { acquire: jest.Mock }
  let deployEntity: jest.Mock
  let getDeployedEntityTimestamp: jest.Mock
  let readDeployment: jest.Mock
  let streamedContents: string[]
  let stageDeployment: jest.Mock

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'create-entity-'))
    files = [await spool(folder, ENTITY_ID, '{"entity":true}'), await spool(folder, 'content-hash', 'scene content')]
    lease = { resize: jest.fn(), release: jest.fn() }
    deploymentMemoryBudget = { acquire: jest.fn().mockReturnValue(lease) }
    deployEntity = jest.fn().mockResolvedValue(1234)
    getDeployedEntityTimestamp = jest.fn().mockResolvedValue(undefined)
    streamedContents = []
    // Hashes every file from its stream and reads the first one in as the entity file.
    readDeployment = jest.fn(async (sources: DeploymentFileSource[]) => {
      for (const source of sources) {
        const chunks: Buffer[] = []
        for await (const chunk of source.openStream()) chunks.push(chunk)
        streamedContents.push(Buffer.concat(chunks).toString())
      }
      await sources[0].read()
      return { hashes: sources.map((_, i) => `hash-${i}`), entity: { timestamp: 1000 } }
    })
    stageDeployment = jest.fn().mockResolvedValue({ kind: 'incomplete', missing: ['other-hash'] })
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await rm(folder, { recursive: true, force: true })
  })

  describe('and it is a regular deployment', () => {
    let deployedContents: Record<string, string>
    let status: number

    beforeEach(async () => {
      deployEntity.mockImplementationOnce(async (contents: Map<string, Uint8Array>) => {
        deployedContents = Object.fromEntries(
          Array.from(contents).map(([hash, content]) => [hash, Buffer.from(content).toString()])
        )
        return 1234
      })
      const response = await createEntity(
        buildContext(files, false, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          partialDeployments: {}
        })
      )
      status = response.status
    })

    it('should hash the files from disk, read the entity file and then every file under memory budget shares, and release them', () => {
      expect({
        status,
        streamedContents,
        deployedContents,
        reserved: deploymentMemoryBudget.acquire.mock.calls,
        released: lease.release.mock.calls.length
      }).toEqual({
        status: 200,
        streamedContents: ['{"entity":true}', 'scene content'],
        deployedContents: { 'hash-0': '{"entity":true}', 'hash-1': 'scene content' },
        reserved: [[files[0].size], [files[0].size + files[1].size]],
        released: 2
      })
    })
  })

  describe('and it is a regular deployment while the memory budget has no room for its entity file', () => {
    let error: unknown

    beforeEach(async () => {
      deploymentMemoryBudget.acquire.mockImplementationOnce(() => {
        throw new UploadBudgetExceededError()
      })
      error = await createEntity(
        buildContext(files, false, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          partialDeployments: {}
        })
      ).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError without deploying', () => {
      expect({ error, deployed: deployEntity.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        deployed: 0
      })
    })
  })

  describe('and it is a regular deployment while the memory budget has no room for its files', () => {
    let withRead: jest.Mock
    let error: unknown

    beforeEach(async () => {
      withRead = jest.fn((operation: () => Promise<unknown>) => operation())
      // The entity file's share fits; the share for every file doesn't.
      deploymentMemoryBudget.acquire.mockReturnValueOnce(lease).mockImplementationOnce(() => {
        throw new UploadBudgetExceededError()
      })
      error = await createEntity(
        buildContext(files, false, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          contentLocks: { withRead },
          partialDeployments: {}
        })
      ).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError without taking the content lock', () => {
      expect({ error, locks: withRead.mock.calls.length, deployed: deployEntity.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        locks: 0,
        deployed: 0
      })
    })
  })

  describe('and it is a regular deployment whose content lock wait times out', () => {
    let error: unknown

    beforeEach(async () => {
      error = await createEntity(
        buildContext(files, false, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          contentLocks: { withRead: jest.fn().mockRejectedValue(new EntityLockTimeoutError(ENTITY_ID)) },
          partialDeployments: {}
        })
      ).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError and release every memory budget share', () => {
      expect({
        rejected: error instanceof ServiceUnavailableError,
        reserved: deploymentMemoryBudget.acquire.mock.calls.length,
        released: lease.release.mock.calls.length
      }).toEqual({ rejected: true, reserved: 2, released: 2 })
    })
  })

  describe('and it is a partial batch', () => {
    let stagedContent: string
    let stagedSize: number
    let stagedEntityFile: string
    let releasedWhileStaging: number
    let status: number

    beforeEach(async () => {
      stageDeployment.mockImplementationOnce(async ({ files: staged, entityFile }) => {
        const chunks: Buffer[] = []
        for await (const chunk of staged.get('content-hash').openStream()) chunks.push(chunk)
        stagedContent = Buffer.concat(chunks).toString()
        stagedSize = staged.get('content-hash').size
        stagedEntityFile = Buffer.from(entityFile).toString()
        releasedWhileStaging = lease.release.mock.calls.length
        return { kind: 'incomplete', missing: ['other-hash'] }
      })
      const response = await createEntity(
        buildContext(files, true, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          partialDeployments: { stageDeployment }
        })
      )
      status = response.status
    })

    it('should read its entity file once, under a memory budget share held until staging settles, and stream the rest from disk', () => {
      expect({
        status,
        streamedContents,
        stagedContent,
        stagedSize,
        stagedEntityFile,
        reserved: deploymentMemoryBudget.acquire.mock.calls,
        releasedWhileStaging,
        released: lease.release.mock.calls.length
      }).toEqual({
        status: 202,
        streamedContents: ['{"entity":true}'],
        stagedContent: 'scene content',
        stagedSize: 'scene content'.length,
        stagedEntityFile: '{"entity":true}',
        reserved: [[files[0].size]],
        releasedWhileStaging: 0,
        released: 1
      })
    })
  })

  describe('and it is a partial batch without its entity file', () => {
    let stagedEntityFile: Uint8Array | undefined
    let status: number

    beforeEach(async () => {
      stageDeployment.mockImplementationOnce(async ({ entityFile }) => {
        stagedEntityFile = entityFile
        return { kind: 'incomplete', missing: ['other-hash'] }
      })
      const response = await createEntity(
        buildContext([files[1]], true, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          partialDeployments: { stageDeployment }
        })
      )
      status = response.status
    })

    it('should leave reading the entity file back to staging, without a memory budget share of its own', () => {
      expect({ status, stagedEntityFile, reserved: deploymentMemoryBudget.acquire.mock.calls.length }).toEqual({
        status: 202,
        stagedEntityFile: undefined,
        reserved: 0
      })
    })
  })

  describe('and a partial batch arrives while another one is still staging and the memory budget fits only one entity file', () => {
    let finishFirst: () => void
    let firstStatus: number
    let secondError: unknown
    let secondUnavailable: boolean

    beforeEach(async () => {
      const limits: Record<string, number> = {
        [EnvironmentConfig.MAX_IN_MEMORY_DEPLOYMENT_BYTES]: files[0].size + 1,
        [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: files[0].size + 1
      }
      const budget = createUploadBudget(
        {
          env: { getConfig: (key: number) => limits[key] } as any,
          metrics: { observe: jest.fn(), increment: jest.fn() } as any
        },
        'memory'
      )
      stageDeployment.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = () => resolve({ kind: 'incomplete', missing: ['other-hash'] })
          })
      )
      const components = {
        deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
        deploymentMemoryBudget: budget,
        partialDeployments: { stageDeployment }
      }
      const first = createEntity(buildContext(files, true, components))
      while (stageDeployment.mock.calls.length === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }
      secondError = await createEntity(buildContext(files, true, components)).catch((e) => e)
      secondUnavailable = secondError instanceof ServiceUnavailableError
      finishFirst()
      firstStatus = (await first).status
    })

    it('should reject the second with a ServiceUnavailableError without staging it and stage the first', () => {
      expect({ secondError, secondUnavailable, firstStatus, staged: stageDeployment.mock.calls.length }).toEqual({
        secondError: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        secondUnavailable: true,
        firstStatus: 202,
        staged: 1
      })
    })
  })

  describe('and staging a partial batch finds no room in the memory budget', () => {
    let error: unknown
    let unavailable: boolean

    beforeEach(async () => {
      stageDeployment.mockRejectedValueOnce(new UploadBudgetExceededError())
      error = await createEntity(
        buildContext([files[1]], true, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          partialDeployments: { stageDeployment }
        })
      ).catch((e) => e)
      unavailable = error instanceof ServiceUnavailableError
    })

    it('should reject with a ServiceUnavailableError', () => {
      expect({ error, unavailable }).toEqual({
        error: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        unavailable: true
      })
    })
  })

  describe('and it is a partial batch while the memory budget has no room for its entity file', () => {
    let error: unknown

    beforeEach(async () => {
      deploymentMemoryBudget.acquire.mockImplementationOnce(() => {
        throw new UploadBudgetExceededError()
      })
      error = await createEntity(
        buildContext(files, true, {
          deployer: { deployEntity, getDeployedEntityTimestamp, readDeployment },
          deploymentMemoryBudget,
          partialDeployments: { stageDeployment }
        })
      ).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError without staging it', () => {
      expect({ error, staged: stageDeployment.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        staged: 0
      })
    })
  })
})
