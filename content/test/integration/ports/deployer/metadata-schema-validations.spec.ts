import { EntityType } from '@dcl/schemas'
import { AuditInfo, DeploymentContext, DeploymentResult } from '../../../../src/deployment-types'
import { AppComponents, EntityVersion } from '../../../../src/types'
import { makeNoopServerValidator } from '../../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment, testCaseWithComponents } from '../../E2ETestEnvironment'
import { buildDeployData, createIdentity, EntityCombo } from '../../E2ETestUtils'

describe('Integration - Deployment with metadata validation', () => {
  const getTestEnv = setupTestEnvironment()

  testCaseWithComponents(
    getTestEnv,
    'When scene metadata is missing, deployment result should include the proper error',
    async (components) => {
      makeNoopServerValidator(components)

      const P1 = '0,0'
      const P2 = '0,1'
      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: { a: 'metadata' }
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: [
          'The metadata for this entity type (scene) is not valid.',
          "must have required property 'main'",
          "must have required property 'scene'"
        ]
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'When scene metadata is present but incomplete, deployment result should include the proper errors',
    async (components) => {
      makeNoopServerValidator(components)

      const P1 = '0,0'
      const P2 = '0,1'
      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: {}
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: [
          'The metadata for this entity type (scene) is not valid.',
          "must have required property 'main'",
          "must have required property 'scene'"
        ]
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'When scene metadata is present but incomplete (missing scene), deployment result should include the proper error',
    async (components) => {
      makeNoopServerValidator(components)

      const P1 = '0,0'
      const P2 = '0,1'
      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: {
          main: 'main.js'
        }
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: ['The metadata for this entity type (scene) is not valid.', "must have required property 'scene'"]
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'When scene metadata is present and ok, deployment fail because of permissions validator',
    async (components) => {
      makeNoopServerValidator(components)

      const P1 = '0,0'
      const P2 = '0,1'
      const identity = createIdentity()

      let E1: EntityCombo = await buildDeployData([P1, P2], {
        type: EntityType.SCENE,
        metadata: {
          main: 'main.js',
          scene: {
            base: P1,
            parcels: [P1, P2]
          }
        },
        identity
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: [
          'The provided Eth Address does not have access to the following parcel: (0,0)',
          'The provided Eth Address does not have access to the following parcel: (0,1)'
        ]
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'When profile metadata is missing, deployment result should include the proper error',
    async (components) => {
      makeNoopServerValidator(components)

      const identity = createIdentity()
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.PROFILE,
        metadata: { a: 'metadata' },
        identity
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: ['The metadata for this entity type (profile) is not valid.', "must have required property 'avatars'"]
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'When profile metadata is present but incomplete (missing avatars), deployment result should include the proper error',
    async (components) => {
      makeNoopServerValidator(components)

      const identity = createIdentity()
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.PROFILE,
        metadata: {},
        identity
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: ['The metadata for this entity type (profile) is not valid.', "must have required property 'avatars'"]
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'When wearable metadata is wrong, deployment result should include the proper error',
    async (components) => {
      makeNoopServerValidator(components)

      const identity = createIdentity()
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.WEARABLE,
        metadata: { a: 'metadata' },
        identity
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: [
          'The metadata for this entity type (wearable) is not valid.',
          "must have required property 'collectionAddress'",
          "must have required property 'rarity'",
          'must pass "_isThirdParty" keyword validation',
          "must have required property 'merkleProof'",
          "must have required property 'content'",
          "must have required property 'id'",
          "must have required property 'name'",
          "must have required property 'description'",
          "must have required property 'i18n'",
          "must have required property 'image'",
          "must have required property 'thumbnail'",
          "must have required property 'data'",
          "must have required property 'id'",
          "must have required property 'name'",
          "must have required property 'description'",
          "must have required property 'i18n'",
          "must have required property 'thumbnail'",
          "must have required property 'image'",
          "must have required property 'data'",
          'either standard XOR thirdparty properties conditions must be met'
        ]
      })
    }
  )

  testCaseWithComponents(
    getTestEnv,
    'When wearable metadata is present but incomplete, deployment result should include the proper error',
    async (components) => {
      makeNoopServerValidator(components)

      const identity = createIdentity()
      let E1: EntityCombo = await buildDeployData([identity.address], {
        type: EntityType.WEARABLE,
        metadata: {},
        identity
      })

      expect(await deployEntity(components, E1)).toEqual({
        errors: [
          'The metadata for this entity type (wearable) is not valid.',
          "must have required property 'collectionAddress'",
          "must have required property 'rarity'",
          'must pass "_isThirdParty" keyword validation',
          "must have required property 'merkleProof'",
          "must have required property 'content'",
          "must have required property 'id'",
          "must have required property 'name'",
          "must have required property 'description'",
          "must have required property 'i18n'",
          "must have required property 'image'",
          "must have required property 'thumbnail'",
          "must have required property 'data'",
          "must have required property 'id'",
          "must have required property 'name'",
          "must have required property 'description'",
          "must have required property 'i18n'",
          "must have required property 'thumbnail'",
          "must have required property 'image'",
          "must have required property 'data'",
          'either standard XOR thirdparty properties conditions must be met'
        ]
      })
    }
  )

  async function deployEntity(
    components: Pick<AppComponents, 'deployer'>,
    entity: EntityCombo,
    overrideAuditInfo?: Partial<AuditInfo>
  ): Promise<DeploymentResult> {
    const newAuditInfo = { version: EntityVersion.V3, authChain: entity.deployData.authChain, ...overrideAuditInfo }
    return await components.deployer.deployEntity(
      Array.from(entity.deployData.files.values()),
      entity.deployData.entityId,
      newAuditInfo,
      DeploymentContext.LOCAL
    )
  }
})
