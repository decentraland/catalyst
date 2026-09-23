import { DeploymentToValidate, validationFailed } from '@dcl/content-validator'
import { hashV1 } from '@dcl/hashing'
import { EntityType } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createContentValidator } from '../../../../src/adapters/content-validator/component'
import { IContentValidator } from '../../../../src/adapters/content-validator/types'
import { ICrypto } from '../../../../src/logic/crypto'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { AppComponents } from '../../../../src/types'
import { createHttpProviderMock } from '../../../mocks/http-provider-mock'
import { createLogsMockedComponent } from '../../../mocks/logger-component-mock'
import { createStorageComponentMock } from '../../../mocks/storage-component-mock'

describe('when validating a scene deployment with blockchain access checks disabled', () => {
  let logs: ILoggerComponent
  let crypto: jest.Mocked<ICrypto>
  let env: Environment
  let validator: IContentValidator
  let deployment: DeploymentToValidate

  beforeEach(async () => {
    logs = createLogsMockedComponent()
    crypto = {
      calculateIPFSHashes: jest.fn(),
      calculateDeprecatedHashes: jest.fn(),
      isAddressOwnedByDecentraland: jest.fn().mockReturnValue(false),
      validateSignature: jest.fn().mockResolvedValue({ ok: true })
    }
    env = new Environment()
    env.setConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS, 'true')
    env.setConfig(EnvironmentConfig.CONTENT_SIZE_FETCH_CONCURRENCY, 10)
    validator = await createContentValidator({
      storage: createStorageComponentMock({ existMultiple: jest.fn().mockResolvedValue(new Map()) }),
      crypto,
      env,
      logs,
      metrics: { increment: jest.fn(), observe: jest.fn() } as unknown as AppComponents['metrics'],
      config: createConfigComponent({}),
      fetcher: { fetch: jest.fn() },
      l1Provider: createHttpProviderMock([]),
      l2Provider: createHttpProviderMock([])
    })
    deployment = {
      entity: {
        id: await hashV1(new TextEncoder().encode('scene-identity-smoke-test-entity')),
        version: 'v3',
        type: EntityType.SCENE,
        pointers: ['0,0', '0,1'],
        timestamp: 1735689600000, // 2025-01-01, after every timestamp-gated ADR validation
        content: [],
        metadata: {
          main: 'bin/game.js',
          scene: { base: '0,0', parcels: ['0,0', '0,1'] }
        }
      },
      files: new Map(),
      auditInfo: { authChain: [] }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the scene parcels match the entity pointers', () => {
    it('should accept the deployment', async () => {
      const result = await validator.validate(deployment)

      expect(result.ok).toBe(true)
    })
  })

  describe('and the entity pointers do not cover every scene parcel', () => {
    beforeEach(() => {
      deployment.entity.pointers = ['0,0']
    })

    it('should reject the deployment before reaching the bypassed access validator', async () => {
      const result = await validator.validate(deployment)

      expect(result).toEqual(validationFailed('The scene parcels must match the entity pointers.'))
    })
  })

  describe('and the scene base is not one of the scene parcels', () => {
    beforeEach(() => {
      deployment.entity.metadata.scene.base = '5,5'
    })

    it('should reject the deployment before reaching the bypassed access validator', async () => {
      const result = await validator.validate(deployment)

      expect(result.ok).toBe(false)
    })
  })
})
