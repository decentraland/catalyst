import { Authenticator } from '@dcl/crypto'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import {
  InvalidPartialDeploymentError,
  PartialDeploymentUnavailableError
} from '../../../src/logic/partial-deployments'

type Context = Parameters<typeof createEntity>[0]

const ENTITY_ID = 'bafkreigdj5jyzxnhfwpkkvslq4vadvyymyi6zgf4gdhsvjfqqmbzl7u7fi'
const ENTITY_TIMESTAMP = 1_700_000_000_000

type Logger = { info: jest.Mock; error: jest.Mock; warn: jest.Mock; debug: jest.Mock }

function buildContext(
  stageDeployment: jest.Mock,
  increment: jest.Mock,
  options: { logger?: Logger; partial?: boolean; signatureOk?: boolean; deployedTimestamp?: number } = {}
): Context {
  const { partial = true, signatureOk = true } = options
  const logger = options.logger ?? { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
  const authChain = Authenticator.createSimpleAuthChain(ENTITY_ID, '0x' + '1'.repeat(40), '0x' + 'a'.repeat(130))
  const fields: Record<string, { fieldname: string; value: string }> = {
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
      files: { [ENTITY_ID]: { fieldname: ENTITY_ID, value: Buffer.from('entity') } }
    },
    components: {
      logs: { getLogger: () => logger },
      metrics: { increment },
      crypto: {
        validateSignature: jest.fn().mockResolvedValue(signatureOk ? { ok: true } : { ok: false, message: 'bad' })
      },
      deployer: {
        getDeployedEntityTimestamp: jest.fn().mockResolvedValue(options.deployedTimestamp),
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
    let logger: Logger

    beforeEach(async () => {
      logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
      stageDeployment.mockRejectedValueOnce(
        new InvalidPartialDeploymentError(
          ['Partial upload storage on this server is full.'],
          429,
          30,
          'bytes_per_server'
        )
      )
      response = await createEntity(buildContext(stageDeployment, increment, { logger }))
    })

    it('should log the throttling as a warning, not an error', () => {
      expect({ warnings: logger.warn.mock.calls.length, errors: logger.error.mock.calls.length }).toEqual({
        warnings: 1,
        errors: 0
      })
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

  describe('and publishing the complete upload fails on the server', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      stageDeployment.mockRejectedValueOnce(
        new PartialDeploymentUnavailableError(['There was an error deploying the entity'], 5)
      )
      response = await createEntity(buildContext(stageDeployment, increment))
    })

    it('should answer a retryable 503 and count it as an error, not a validation failure', () => {
      expect({ response, metrics: increment.mock.calls }).toEqual({
        response: {
          status: 503,
          body: { errors: ['There was an error deploying the entity'] },
          headers: { 'Retry-After': '5' }
        },
        metrics: [['dcl_partial_deployments_staging_total', { kind: 'error' }]]
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

describe('when a partial batch is answered 200', () => {
  let stageDeployment: jest.Mock
  let increment: jest.Mock

  beforeEach(() => {
    stageDeployment = jest.fn()
    increment = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and it published the entity', () => {
    beforeEach(async () => {
      stageDeployment.mockResolvedValueOnce({ kind: 'deployed', creationTimestamp: ENTITY_TIMESTAMP })
      await createEntity(buildContext(stageDeployment, increment))
    })

    it('should count it as finalized', () => {
      expect(increment.mock.calls).toEqual([['dcl_partial_deployments_staging_total', { kind: 'finalized' }]])
    })
  })

  describe('and another request had already published the entity', () => {
    beforeEach(async () => {
      stageDeployment.mockResolvedValueOnce({ kind: 'replayed', creationTimestamp: ENTITY_TIMESTAMP })
      await createEntity(buildContext(stageDeployment, increment))
    })

    it('should count it as replayed, not finalized', () => {
      expect(increment.mock.calls).toEqual([['dcl_partial_deployments_staging_total', { kind: 'replayed' }]])
    })
  })

  describe('and the entity was published before the batch arrived', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      response = await createEntity(buildContext(stageDeployment, increment, { deployedTimestamp: ENTITY_TIMESTAMP }))
    })

    it('should answer its timestamp and count it as replayed, not finalized', () => {
      expect({ response, metrics: increment.mock.calls }).toEqual({
        response: { status: 200, body: { creationTimestamp: ENTITY_TIMESTAMP } },
        metrics: [['dcl_partial_deployments_staging_total', { kind: 'replayed' }]]
      })
    })
  })
})

describe('when a deployment is not validly signed', () => {
  let increment: jest.Mock
  let response: Awaited<ReturnType<typeof createEntity>>

  beforeEach(() => {
    increment = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and it is a partial batch', () => {
    beforeEach(async () => {
      response = await createEntity(buildContext(jest.fn(), increment, { signatureOk: false }))
    })

    it('should answer a 400 counted as a staging validation error', () => {
      expect({ status: response.status, metrics: increment.mock.calls }).toEqual({
        status: 400,
        metrics: [['dcl_partial_deployments_staging_total', { kind: 'validation_error' }]]
      })
    })
  })

  describe('and it is a regular deployment', () => {
    beforeEach(async () => {
      response = await createEntity(buildContext(jest.fn(), increment, { partial: false, signatureOk: false }))
    })

    it('should answer a 400 counted as a deployment validation error', () => {
      expect({ status: response.status, metrics: increment.mock.calls }).toEqual({
        status: 400,
        metrics: [['dcl_deployments_endpoint_counter', { kind: 'validation_error' }]]
      })
    })
  })
})

describe('when a partial batch comes from a source that spent its daily quota', () => {
  let stageDeployment: jest.Mock
  let increment: jest.Mock
  let isLiveUploadOf: jest.Mock
  let context: Context
  let response: Awaited<ReturnType<typeof createEntity>>

  beforeEach(() => {
    stageDeployment = jest.fn()
    increment = jest.fn()
    isLiveUploadOf = jest.fn()
    context = buildContext(stageDeployment, increment)
    context.components.partialDeployments.isLiveUploadOf = isLiveUploadOf
    context.partialQuota = { exhaustedRetryAfterSeconds: 120, admitted: false }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the signer has no live upload of the entity', () => {
    beforeEach(async () => {
      isLiveUploadOf.mockResolvedValueOnce(false)
      response = await createEntity(context)
    })

    it('should answer a 429 until the quota resets without staging the batch', () => {
      expect({ response, staged: stageDeployment.mock.calls.length }).toEqual({
        response: {
          status: 429,
          body: {
            errors: ['The daily deployment quota for this client is exhausted. Only uploads in progress can continue.']
          },
          headers: { 'Retry-After': '120' }
        },
        staged: 0
      })
    })
  })

  describe('and the batch resumes the signer own live upload', () => {
    beforeEach(async () => {
      isLiveUploadOf.mockResolvedValueOnce(true)
      stageDeployment.mockImplementationOnce(async (input: { onAdmitted?: () => void }) => {
        input.onAdmitted?.()
        return { kind: 'incomplete', missing: [] }
      })
      response = await createEntity(context)
    })

    it('should stage it and report it as admitted', () => {
      expect({ status: response.status, quota: context.partialQuota }).toEqual({
        status: 202,
        quota: { exhaustedRetryAfterSeconds: 120, admitted: true }
      })
    })
  })
})
