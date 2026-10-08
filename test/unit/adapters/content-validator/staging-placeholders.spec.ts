import { DeploymentToValidate } from '@dcl/content-validator'
import { hashV1 } from '@dcl/hashing'
import { EntityType } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createContentValidator } from '../../../../src/adapters/content-validator/component'
import { IContentValidator } from '../../../../src/adapters/content-validator/types'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { AppComponents } from '../../../../src/types'
import { createHttpProviderMock } from '../../../mocks/http-provider-mock'
import { createLogsMockedComponent } from '../../../mocks/logger-component-mock'
import { createStorageComponentMock } from '../../../mocks/storage-component-mock'

// Partial staging passes content files as empty placeholders and never loads them into memory. That is
// only sound while every staging validation reads file names, not bytes; this guards the assumption
// against @dcl/content-validator upgrades.
describe('when staging a scene whose content files are empty placeholders', () => {
  let validator: IContentValidator
  let deployment: DeploymentToValidate
  let result: { ok: boolean; errors?: string[] }

  beforeEach(async () => {
    const env = new Environment()
    env.setConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS, 'true')
    env.setConfig(EnvironmentConfig.CONTENT_SIZE_FETCH_CONCURRENCY, 10)
    validator = await createContentValidator({
      storage: createStorageComponentMock({ existMultiple: jest.fn().mockResolvedValue(new Map()) }),
      crypto: {
        calculateIPFSHashes: jest.fn(),
        calculateDeprecatedHashes: jest.fn(),
        isAddressOwnedByDecentraland: jest.fn().mockReturnValue(false),
        validateSignature: jest.fn().mockResolvedValue({ ok: true })
      },
      env,
      logs: createLogsMockedComponent(),
      metrics: { increment: jest.fn(), observe: jest.fn() } as unknown as AppComponents['metrics'],
      config: createConfigComponent({}),
      fetcher: { fetch: jest.fn() },
      l1Provider: createHttpProviderMock([]),
      l2Provider: createHttpProviderMock([])
    })
    const contentHash = await hashV1(new TextEncoder().encode('scene content'))
    const entityFile = new TextEncoder().encode('staging-placeholder-entity')
    const entityId = await hashV1(entityFile)
    deployment = {
      entity: {
        id: entityId,
        version: 'v3',
        type: EntityType.SCENE,
        pointers: ['0,0'],
        timestamp: 1735689600000,
        content: [{ file: 'bin/game.js', hash: contentHash }],
        metadata: { main: 'bin/game.js', scene: { base: '0,0', parcels: ['0,0'] } }
      },
      files: new Map([
        [entityId, entityFile],
        [contentHash, new Uint8Array(0)]
      ]),
      auditInfo: { authChain: [] }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and every placeholder is referenced by the entity', () => {
    beforeEach(async () => {
      result = await validator.validateStagingScene(deployment, { skipAccessCheck: true })
    })

    it('should accept the batch without reading the placeholder bytes', () => {
      expect(result).toEqual(expect.objectContaining({ ok: true }))
    })
  })

  describe('and a placeholder is not referenced by the entity', () => {
    let unreferencedHash: string

    beforeEach(async () => {
      unreferencedHash = await hashV1(new TextEncoder().encode('unreferenced content'))
      deployment.files.set(unreferencedHash, new Uint8Array(0))
      result = await validator.validateStagingScene(deployment, { skipAccessCheck: true })
    })

    it('should reject the batch by the file name alone', () => {
      expect(result).toEqual({
        ok: false,
        errors: [`This hash was uploaded but is not referenced in the entity: ${unreferencedHash}`]
      })
    })
  })
})
