import { Authenticator } from '@dcl/crypto'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import { InvalidPartialDeploymentError } from '../../../src/logic/partial-deployments'

type Context = Parameters<typeof createEntity>[0]

const ENTITY_ID = 'bafkreigdj5jyzxnhfwpkkvslq4vadvyymyi6zgf4gdhsvjfqqmbzl7u7fi'
const ENTITY_TIMESTAMP = 1_700_000_000_000

function buildContext(stageDeployment: jest.Mock, increment: jest.Mock): Context {
  const authChain = Authenticator.createSimpleAuthChain(ENTITY_ID, '0x' + '1'.repeat(40), '0x' + 'a'.repeat(130))
  return {
    request: { headers: { get: () => null } },
    formData: {
      fields: {
        entityId: { fieldname: 'entityId', value: ENTITY_ID },
        authChain: { fieldname: 'authChain', value: JSON.stringify(authChain) },
        partial: { fieldname: 'partial', value: 'true' }
      },
      files: { [ENTITY_ID]: { fieldname: ENTITY_ID, value: Buffer.from('entity') } }
    },
    components: {
      logs: { getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
      metrics: { increment },
      crypto: { validateSignature: jest.fn().mockResolvedValue({ ok: true }) },
      deployer: {
        getDeployedEntityTimestamp: jest.fn().mockResolvedValue(undefined),
        readDeployment: jest.fn().mockResolvedValue({ files: new Map(), entity: { timestamp: ENTITY_TIMESTAMP } })
      },
      contentLocks: { withRead: jest.fn() },
      partialDeployments: { stageDeployment }
    }
  } as unknown as Context
}

describe('when a partial batch is rejected', () => {
  let stageDeployment: jest.Mock
  let increment: jest.Mock

  beforeEach(() => {
    stageDeployment = jest.fn()
    increment = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and a partial-upload quota answers it with a 429', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      stageDeployment.mockRejectedValueOnce(
        new InvalidPartialDeploymentError(
          ['Partial upload storage on this server is full.'],
          429,
          30,
          'bytes_per_server'
        )
      )
      response = await createEntity(buildContext(stageDeployment, increment))
    })

    it('should answer the 429 and count it as throttled by the quota that rejected it', () => {
      expect({ status: response.status, metrics: increment.mock.calls }).toEqual({
        status: 429,
        metrics: [
          ['dcl_partial_deployments_staging_total', { kind: 'throttled' }],
          ['dcl_partial_upload_throttled_total', { reason: 'bytes_per_server' }]
        ]
      })
    })
  })

  describe('and a validation failure answers it with a 400', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      stageDeployment.mockRejectedValueOnce(new InvalidPartialDeploymentError(['The entity is invalid.']))
      response = await createEntity(buildContext(stageDeployment, increment))
    })

    it('should answer the 400 and count it as a validation error only', () => {
      expect({ status: response.status, metrics: increment.mock.calls }).toEqual({
        status: 400,
        metrics: [['dcl_partial_deployments_staging_total', { kind: 'validation_error' }]]
      })
    })
  })

  describe('and the content lock stays busy', () => {
    let error: unknown

    beforeEach(async () => {
      stageDeployment.mockRejectedValueOnce(new EntityLockTimeoutError(ENTITY_ID))
      error = await createEntity(buildContext(stageDeployment, increment)).catch((e) => e)
    })

    it('should fail with a 503 error and count the batch as busy', () => {
      expect({ error: (error as Error).name, metrics: increment.mock.calls }).toEqual({
        error: 'ServiceUnavailableError',
        metrics: [['dcl_partial_deployments_staging_total', { kind: 'busy' }]]
      })
    })
  })
})
