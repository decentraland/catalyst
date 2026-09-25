import { Authenticator } from '@dcl/crypto'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { ServiceUnavailableError } from '../../../src/controllers/errors'
import { UploadBudgetExceededError } from '../../../src/adapters/upload-budget'
import { SpooledFile } from '../../../src/types'

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
  let stageDeployment: jest.Mock

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'create-entity-'))
    files = [await spool(folder, ENTITY_ID, '{"entity":true}'), await spool(folder, 'content-hash', 'scene content')]
    lease = { resize: jest.fn(), release: jest.fn() }
    deploymentMemoryBudget = { acquire: jest.fn().mockReturnValue(lease) }
    deployEntity = jest.fn().mockResolvedValue(1234)
    getDeployedEntityTimestamp = jest.fn().mockResolvedValue(undefined)
    stageDeployment = jest.fn().mockResolvedValue({ kind: 'incomplete', missing: ['other-hash'] })
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await rm(folder, { recursive: true, force: true })
  })

  describe('and it is a regular deployment', () => {
    let deployedContents: string[]
    let status: number

    beforeEach(async () => {
      deployEntity.mockImplementationOnce(async (contents: Uint8Array[]) => {
        deployedContents = contents.map((content) => Buffer.from(content).toString())
        return 1234
      })
      const response = await createEntity(
        buildContext(files, false, {
          deployer: { deployEntity, getDeployedEntityTimestamp },
          deploymentMemoryBudget,
          partialDeployments: {}
        })
      )
      status = response.status
    })

    it('should deploy the files read from disk under a memory budget share sized to them, then release it', () => {
      expect({
        status,
        deployedContents,
        reserved: deploymentMemoryBudget.acquire.mock.calls,
        released: lease.release.mock.calls.length
      }).toEqual({
        status: 200,
        deployedContents: ['{"entity":true}', 'scene content'],
        reserved: [[files[0].size + files[1].size]],
        released: 1
      })
    })
  })

  describe('and it is a regular deployment while the memory budget is full', () => {
    let error: unknown

    beforeEach(async () => {
      deploymentMemoryBudget.acquire.mockImplementationOnce(() => {
        throw new UploadBudgetExceededError('bytes')
      })
      error = await createEntity(
        buildContext(files, false, {
          deployer: { deployEntity, getDeployedEntityTimestamp },
          deploymentMemoryBudget,
          partialDeployments: {}
        })
      ).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError without deploying', () => {
      expect({ error, deployed: deployEntity.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'),
        deployed: 0
      })
    })
  })

  describe('and it is a partial batch', () => {
    let stagedContent: string
    let stagedSize: number
    let status: number

    beforeEach(async () => {
      stageDeployment.mockImplementationOnce(async ({ files: staged }) => {
        stagedContent = Buffer.from(await staged.get('content-hash').read()).toString()
        stagedSize = staged.get('content-hash').size
        return { kind: 'incomplete', missing: ['other-hash'] }
      })
      const response = await createEntity(
        buildContext(files, true, {
          deployer: { deployEntity, getDeployedEntityTimestamp },
          deploymentMemoryBudget,
          partialDeployments: { stageDeployment }
        })
      )
      status = response.status
    })

    it('should stage the files from disk without taking a memory budget share', () => {
      expect({ status, stagedContent, stagedSize, reserved: deploymentMemoryBudget.acquire.mock.calls.length }).toEqual(
        {
          status: 202,
          stagedContent: 'scene content',
          stagedSize: 'scene content'.length,
          reserved: 0
        }
      )
    })
  })
})
