import { Authenticator } from '@dcl/crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import { ServiceUnavailableError } from '../../../src/controllers/errors'

type Context = Parameters<typeof createEntity>[0]

const ENTITY_ID = 'bafkreigdj5jyzxnhfwpkkvslq4vadvyymyi6zgf4gdhsvjfqqmbzl7u7fi'
const ENTITY_TIMESTAMP = 1_700_000_000_000
const NOW = ENTITY_TIMESTAMP + 5 * 60 * 1000

// The spool folder the request's files are written to; created per test.
let spoolDir: string

function buildContext(
  partial: boolean,
  components: Record<string, unknown>,
  files: Record<string, Buffer> = { [ENTITY_ID]: Buffer.from('entity') }
): Context {
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
    formData: {
      fields,
      files: Object.fromEntries(
        Object.entries(files).map(([name, value]) => {
          writeFileSync(path.join(spoolDir, name), value)
          return [name, { fieldname: name, path: path.join(spoolDir, name), size: value.length }]
        })
      )
    },
    components: {
      logs: { getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
      metrics: { increment: jest.fn() },
      deploymentMemoryBudget: { acquire: () => ({ resize: jest.fn(), release: jest.fn() }) },
      ...components
    }
  } as unknown as Context
}

describe('when creating an entity under the content lock', () => {
  let withRead: jest.Mock
  let validateSignature: jest.Mock
  let getDeployedEntityTimestamp: jest.Mock
  let readDeployment: jest.Mock
  let deployer: Record<string, jest.Mock>
  let stageDeployment: jest.Mock

  beforeEach(() => {
    spoolDir = mkdtempSync(path.join(tmpdir(), 'create-entity-lock-'))
    withRead = jest.fn()
    stageDeployment = jest.fn()
    validateSignature = jest.fn()
    getDeployedEntityTimestamp = jest.fn().mockResolvedValue(undefined)
    readDeployment = jest.fn().mockResolvedValue({ hashes: [], entity: { timestamp: ENTITY_TIMESTAMP } })
    deployer = { getDeployedEntityTimestamp, readDeployment }
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
    rmSync(spoolDir, { recursive: true, force: true })
  })

  describe('and a partial batch is not validly signed', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: false, message: 'bad signature' })
      response = await createEntity(
        buildContext(true, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer
        })
      )
    })

    it('should reject it with a 400 without taking any content lock', () => {
      expect({ response, locks: withRead.mock.calls.length }).toEqual({
        response: { status: 400, body: { errors: ['The signature is invalid. bad signature'] } },
        locks: 0
      })
    })
  })

  describe('and a regular deployment is not validly signed', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: false, message: 'bad signature' })
      response = await createEntity(
        buildContext(false, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer
        })
      )
    })

    it('should reject it with a 400 without taking any content lock', () => {
      expect({ response, locks: withRead.mock.calls.length }).toEqual({
        response: { status: 400, body: { errors: ['The signature is invalid. bad signature'] } },
        locks: 0
      })
    })
  })

  describe.each([
    ['a regular deployment', false],
    ['a partial batch carrying its entity file', true]
  ])('and %s is signed by a chain that expired after the entity was created', (_, partial) => {
    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      withRead.mockResolvedValueOnce({ status: 200, body: { creationTimestamp: NOW } })
      stageDeployment.mockResolvedValueOnce({ kind: 'deployed', creationTimestamp: NOW })
      await createEntity(
        buildContext(partial, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer,
          partialDeployments: { stageDeployment }
        })
      )
    })

    it('should check the chain at the entity timestamp, as the deployment validation does, before deploying it', () => {
      expect({
        checkedAt: validateSignature.mock.calls.map(([, , date]) => date),
        deployments: withRead.mock.calls.length + stageDeployment.mock.calls.length
      }).toEqual({ checkedAt: [ENTITY_TIMESTAMP], deployments: 1 })
    })
  })

  describe('and a regular deployment is deployed', () => {
    let deployEntity: jest.Mock
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      readDeployment.mockResolvedValueOnce({ hashes: [ENTITY_ID], entity: { timestamp: ENTITY_TIMESTAMP } })
      deployEntity = jest.fn().mockResolvedValue(NOW)
      // The spool is gone once the lock is held, so only files read before it can be deployed.
      withRead.mockImplementationOnce(async (operation: () => Promise<unknown>) => {
        rmSync(spoolDir, { recursive: true, force: true })
        return operation()
      })
      response = await createEntity(
        buildContext(false, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer: { ...deployer, deployEntity }
        })
      )
    })

    it('should read its files in before taking the content lock', () => {
      expect({ response, deployed: deployEntity.mock.calls.map(([files]) => files) }).toEqual({
        response: { status: 200, body: { creationTimestamp: NOW } },
        deployed: [new Map([[ENTITY_ID, Buffer.from('entity')]])]
      })
    })
  })

  describe('and a partial batch carrying its entity file is staged', () => {
    let stagedEntity: string

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      readDeployment.mockImplementationOnce(async ([source]) => {
        await source.read()
        return { hashes: [ENTITY_ID], entity: { timestamp: ENTITY_TIMESTAMP } }
      })
      // The spool is gone by the time staging runs, so only bytes read once before it can be staged.
      stageDeployment.mockImplementationOnce(async ({ files }) => {
        rmSync(spoolDir, { recursive: true, force: true })
        const chunks: Buffer[] = []
        for await (const chunk of files.get(ENTITY_ID).openStream()) {
          chunks.push(chunk)
        }
        stagedEntity = Buffer.concat(chunks).toString()
        return { kind: 'incomplete', missing: [] }
      })
      await createEntity(
        buildContext(true, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer,
          partialDeployments: { stageDeployment }
        })
      )
    })

    it('should stage the entity file from the bytes it read once', () => {
      expect(stagedEntity).toBe('entity')
    })
  })

  describe('and a partial batch resumes an upload without its entity file', () => {
    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      stageDeployment.mockResolvedValueOnce({ kind: 'incomplete', missing: [] })
      await createEntity(
        buildContext(
          true,
          {
            contentLocks: { withRead },
            crypto: { validateSignature },
            deployer,
            partialDeployments: { stageDeployment }
          },
          {}
        )
      )
    })

    it('should check the chain now, as the storage read-back of its entity file requires', () => {
      expect({
        checkedAt: validateSignature.mock.calls.map(([, , date]) => date),
        read: readDeployment.mock.calls.length
      }).toEqual({ checkedAt: [NOW], read: 0 })
    })
  })

  describe('and a regular deployment carries no readable entity file', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      readDeployment.mockResolvedValueOnce({ errors: ['Failed to find the entity file.'] })
      response = await createEntity(
        buildContext(false, { contentLocks: { withRead }, crypto: { validateSignature }, deployer })
      )
    })

    it('should reject it with a 400 without checking its signature or taking any content lock', () => {
      expect({
        response,
        signatureChecks: validateSignature.mock.calls.length,
        locks: withRead.mock.calls.length
      }).toEqual({
        response: { status: 400, body: { errors: ['Failed to find the entity file.'] } },
        signatureChecks: 0,
        locks: 0
      })
    })
  })

  describe.each([
    ['a regular deployment', false],
    ['a partial batch', true]
  ])('and %s replays an already deployed entity', (_, partial) => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      getDeployedEntityTimestamp.mockResolvedValueOnce(1234)
      validateSignature.mockResolvedValueOnce({ ok: false, message: 'Ephemeral key expired' })
      response = await createEntity(
        buildContext(partial, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer
        })
      )
    })

    it('should answer 200 with the original creation timestamp without re-authenticating or taking any lock', () => {
      expect({
        response,
        signatureChecks: validateSignature.mock.calls.length,
        locks: withRead.mock.calls.length
      }).toEqual({ response: { status: 200, body: { creationTimestamp: 1234 } }, signatureChecks: 0, locks: 0 })
    })
  })

  describe('and a partial batch is staged', () => {
    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      stageDeployment.mockResolvedValueOnce({ kind: 'incomplete', missing: [] })
      await createEntity(
        buildContext(true, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer,
          partialDeployments: { stageDeployment }
        })
      )
    })

    it('should leave the content lock to staging, which takes it only to store and publish', () => {
      expect({ locks: withRead.mock.calls.length, staged: stageDeployment.mock.calls.length }).toEqual({
        locks: 0,
        staged: 1
      })
    })
  })

  describe('and a partial batch finds its entity locked past the bounded wait', () => {
    let error: unknown

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      stageDeployment.mockRejectedValueOnce(new EntityLockTimeoutError(ENTITY_ID))
      error = await createEntity(
        buildContext(true, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer,
          partialDeployments: { stageDeployment }
        })
      ).catch((e) => e)
    })

    it('should answer with a retryable ServiceUnavailableError', () => {
      expect(error).toEqual(new ServiceUnavailableError(new EntityLockTimeoutError(ENTITY_ID).message))
    })
  })

  describe('and the entity stays locked by another request past the bounded wait', () => {
    let error: unknown

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      withRead.mockRejectedValueOnce(new EntityLockTimeoutError(ENTITY_ID))
      error = await createEntity(
        buildContext(false, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer
        })
      ).catch((e) => e)
    })

    it('should answer with a retryable ServiceUnavailableError', () => {
      expect(error).toEqual(new ServiceUnavailableError(new EntityLockTimeoutError(ENTITY_ID).message))
    })
  })
})
