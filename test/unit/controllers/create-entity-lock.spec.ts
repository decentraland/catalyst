import { Authenticator } from '@dcl/crypto'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import { ServiceUnavailableError } from '../../../src/controllers/errors'

type Context = Parameters<typeof createEntity>[0]

const ENTITY_ID = 'bafkreigdj5jyzxnhfwpkkvslq4vadvyymyi6zgf4gdhsvjfqqmbzl7u7fi'

function buildContext(partial: boolean, components: Record<string, unknown>): Context {
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
    formData: { fields, files: {} },
    components: {
      logs: { getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
      metrics: { increment: jest.fn() },
      ...components
    }
  } as unknown as Context
}

describe('when creating an entity under the content lock', () => {
  let withRead: jest.Mock
  let validateSignature: jest.Mock
  let getDeployedEntityTimestamp: jest.Mock

  beforeEach(() => {
    withRead = jest.fn()
    validateSignature = jest.fn()
    getDeployedEntityTimestamp = jest.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and a partial batch is not validly signed', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: false, message: 'bad signature' })
      response = await createEntity(
        buildContext(true, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer: { getDeployedEntityTimestamp }
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
          deployer: { getDeployedEntityTimestamp }
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
          deployer: { getDeployedEntityTimestamp }
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

  describe('and the entity stays locked by another request past the bounded wait', () => {
    let error: unknown

    beforeEach(async () => {
      validateSignature.mockResolvedValueOnce({ ok: true })
      withRead.mockRejectedValueOnce(new EntityLockTimeoutError(ENTITY_ID))
      error = await createEntity(
        buildContext(false, {
          contentLocks: { withRead },
          crypto: { validateSignature },
          deployer: { getDeployedEntityTimestamp }
        })
      ).catch((e) => e)
    })

    it('should answer with a retryable ServiceUnavailableError', () => {
      expect(error).toEqual(new ServiceUnavailableError(new EntityLockTimeoutError(ENTITY_ID).message))
    })
  })
})
