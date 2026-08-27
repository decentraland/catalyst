/**
 * @jest-environment ./test/fetch-environment.js
 *
 * The handler reads `context.request.headers`, so these tests need the real `Request` class that
 * Jest 27's sandboxed `node` environment omits.
 */
import { hashV1 } from '@dcl/hashing'
import { HTTPProvider } from 'eth-connect'
import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import { DeploymentContext } from '../../../src/deployment-types'
import { createCrypto } from '../../../src/logic/crypto'
import { DeploymentQuotaExceededError, DeploymentQuotaWindow } from '../../../src/logic/deployment-quota'
import { IDeploymentQuota } from '../../../src/logic/deployment-quota/types'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { createErrorHandler } from '../../../src/controllers/middlewares'
import { TooManyRequestsError } from '../../../src/controllers/errors'
import { metricsDeclaration } from '../../../src/metrics'
import { createLogsMockedComponent } from '../../mocks/logger-component-mock'

const DEPLOYER_ADDRESS = '0x1337e0507eb4ab47e08a179573ed4533d9e22a7b'
const CREATION_TIMESTAMP = 1_780_000_000_000

type HandlerComponents = {
  logs: ReturnType<typeof createLogsMockedComponent>
  fs: unknown
  metrics: ReturnType<typeof createTestMetricsComponent<keyof typeof metricsDeclaration>>
  deployer: { deployEntity: jest.Mock }
  crypto: ReturnType<typeof createCrypto>
  entities: { parse: jest.Mock }
  deploymentQuota: jest.Mocked<IDeploymentQuota>
}

/** A serialized entity plus the id it actually hashes to, which is what the deployer looks it up by. */
async function buildEntityFile(): Promise<{ entityId: string; content: Buffer }> {
  const content = Buffer.from(
    JSON.stringify({ type: EntityType.SCENE, pointers: ['0,0'], timestamp: CREATION_TIMESTAMP, content: [] })
  )
  return { entityId: await hashV1(content), content }
}

/** Builds the context the router hands the handler after the multipart parser has run. */
function buildContext(
  components: HandlerComponents,
  entityId: string,
  files: Record<string, Buffer>,
  remoteAddress = '203.0.113.7'
): any {
  return {
    components,
    remoteAddress,
    request: new Request('http://localhost/entities', { method: 'POST' }),
    url: new URL('http://localhost/entities'),
    params: {},
    formData: {
      fields: {
        entityId: { fieldname: 'entityId', value: entityId },
        authChain: {
          fieldname: 'authChain',
          value: JSON.stringify([{ type: 'SIGNER', payload: DEPLOYER_ADDRESS, signature: '' }])
        }
      },
      files: Object.fromEntries(
        Object.entries(files).map(([name, content]) => [name, { fieldname: name, value: content }])
      )
    }
  }
}

async function errorCountFor(components: HandlerComponents, kind: string): Promise<number> {
  const metric = components.metrics.registry.getSingleMetric('dcl_deployments_endpoint_counter')
  const values = ((await metric?.get())?.values ?? []) as { labels: { kind: string }; value: number }[]
  return values.filter((value) => value.labels.kind === kind).reduce((total, value) => total + value.value, 0)
}

describe('when a client posts an entity', () => {
  let components: HandlerComponents
  let entityId: string
  let content: Buffer

  beforeEach(async () => {
    ;({ entityId, content } = await buildEntityFile())
    components = {
      logs: createLogsMockedComponent(),
      fs: {},
      metrics: createTestMetricsComponent(metricsDeclaration),
      deployer: { deployEntity: jest.fn().mockResolvedValue(CREATION_TIMESTAMP) },
      crypto: createCrypto({} as HTTPProvider, [DEPLOYER_ADDRESS]),
      entities: { parse: jest.fn().mockReturnValue({ type: EntityType.SCENE, pointers: ['0,0'] }) },
      deploymentQuota: { assertWithinQuota: jest.fn().mockResolvedValue(undefined) }
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and it is within its quota', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      response = await createEntity(buildContext(components, entityId, { [entityId]: content }))
    })

    it('should deploy the entity', () => {
      expect(response).toEqual({ status: 200, body: { creationTimestamp: CREATION_TIMESTAMP } })
    })

    it("should have counted the attempt against the entity's own type", () => {
      expect(components.deploymentQuota.assertWithinQuota).toHaveBeenCalledWith(
        expect.objectContaining({ remoteAddress: '203.0.113.7' }),
        EntityType.SCENE
      )
    })

    it('should hand the deployer the hashes it already computed, so nothing is hashed twice', () => {
      expect(components.deployer.deployEntity).toHaveBeenCalledWith(
        new Map([[entityId, content]]),
        entityId,
        expect.objectContaining({ version: 'v3' }),
        DeploymentContext.LOCAL
      )
    })
  })

  describe('and the entity file is not named after its hash', () => {
    beforeEach(async () => {
      await createEntity(buildContext(components, entityId, { 'scene.json': content }))
    })

    it('should still count the attempt, since the entity is located by its computed hash', () => {
      expect(components.deploymentQuota.assertWithinQuota).toHaveBeenCalledWith(expect.anything(), EntityType.SCENE)
    })
  })

  describe('and the upload carries no entity file at all', () => {
    beforeEach(async () => {
      await createEntity(buildContext(components, entityId, { 'other.txt': Buffer.from('not the entity') }))
    })

    it('should leave the attempt uncounted rather than guess an entity type', () => {
      expect(components.deploymentQuota.assertWithinQuota).not.toHaveBeenCalled()
    })

    it('should still hand the deployment to the deployer, which answers for it', () => {
      expect(components.deployer.deployEntity).toHaveBeenCalled()
    })
  })

  describe('and the entity file cannot be parsed', () => {
    let response: Awaited<ReturnType<typeof createEntity>>

    beforeEach(async () => {
      components.entities.parse.mockImplementation(() => {
        throw new Error('There was a problem parsing the entity')
      })
      components.deployer.deployEntity.mockResolvedValue({ errors: ['There was a problem parsing the entity'] })
      response = await createEntity(buildContext(components, entityId, { [entityId]: content }))
    })

    it('should leave the attempt uncounted', () => {
      expect(components.deploymentQuota.assertWithinQuota).not.toHaveBeenCalled()
    })

    it("should keep the deployer's own 400, rather than change the shape of that response", () => {
      expect(response).toEqual({ status: 400, body: { errors: ['There was a problem parsing the entity'] } })
    })
  })

  describe('and it has exhausted its quota', () => {
    let thrown: unknown

    beforeEach(async () => {
      components.deploymentQuota.assertWithinQuota.mockRejectedValue(
        new DeploymentQuotaExceededError(EntityType.SCENE, DeploymentQuotaWindow.HOUR, 600, 1234)
      )
      thrown = await createEntity(buildContext(components, entityId, { [entityId]: content })).catch((error) => error)
    })

    it('should reject the deployment with the retry delay the quota reported', () => {
      expect(thrown).toMatchObject({ name: 'TooManyRequestsError', retryAfterSeconds: 1234 })
    })

    it('should not disclose the limit or the window that was hit', () => {
      expect((thrown as Error).message).toBe('Too many deployments from this address. Retry in 1234 seconds.')
    })

    it('should never reach the deployer', () => {
      expect(components.deployer.deployEntity).not.toHaveBeenCalled()
    })

    it('should not be counted as an internal error, which the rejected client would otherwise drive', async () => {
      expect(await errorCountFor(components, 'error')).toBe(0)
    })
  })
})

describe('when the error handler receives a rejection from the deployment quota', () => {
  let response: any

  beforeEach(async () => {
    const handler = createErrorHandler({ logs: createLogsMockedComponent() })
    response = await handler({} as any, async () => {
      throw new TooManyRequestsError('Too many deployments from this address. Retry in 42 seconds.', 42)
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should answer 429 with the retry delay and the error body the rest of the API uses', () => {
    expect(response).toEqual({
      status: 429,
      body: { error: 'Too many deployments from this address. Retry in 42 seconds.' },
      headers: { 'Retry-After': '42' }
    })
  })
})
