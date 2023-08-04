import { EntityType } from '@dcl/schemas'
import { AuditInfo, DeploymentContext, DeploymentResult, InvalidResult } from '../../../../src/deployment-types'
import { AppComponents, EntityVersion } from '../../../../src/types'
import { makeNoopServerValidator } from '../../../helpers/service/validations/NoOpValidator'
import { EntityCombo, buildDeployData, createIdentity } from '../../E2ETestUtils'
import { TestProgram } from '../../TestProgram'
import { createDefaultServer, resetServer } from '../../simpleTestEnvironment'

const P1 = '0,0'
const P2 = '0,1'
describe('Integration - Deployment with metadata validation', () => {
  let server: TestProgram

  const identity = createIdentity()

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopServerValidator(server.components)
  })

  beforeEach(async () => {
    await resetServer(server)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
  })

  it('When scene metadata is missing, deployment result should include the proper error', async () => {
    const { components } = server
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
  })

  it('When scene metadata is present but incomplete, deployment result should include the proper errors', async () => {
    const { components } = server

    const E1: EntityCombo = await buildDeployData([P1, P2], {
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
  })

  it('When scene metadata is present but incomplete (missing scene), deployment result should include the proper error', async () => {
    const { components } = server

    const E1: EntityCombo = await buildDeployData([P1, P2], {
      type: EntityType.SCENE,
      metadata: {
        main: 'main.js'
      }
    })

    expect(await deployEntity(components, E1)).toEqual({
      errors: ['The metadata for this entity type (scene) is not valid.', "must have required property 'scene'"]
    })
  })

  it('When profile metadata is missing, deployment result should include the proper error', async () => {
    const { components } = server
    const E1: EntityCombo = await buildDeployData([identity.address], {
      type: EntityType.PROFILE,
      metadata: { a: 'metadata' },
      identity
    })

    expect(await deployEntity(components, E1)).toEqual({
      errors: ['The metadata for this entity type (profile) is not valid.', "must have required property 'avatars'"]
    })
  })

  it('When profile metadata is present but incomplete (missing avatars), deployment result should include the proper error', async () => {
    const { components } = server
    const E1: EntityCombo = await buildDeployData([identity.address], {
      type: EntityType.PROFILE,
      metadata: {},
      identity
    })

    expect(await deployEntity(components, E1)).toEqual({
      errors: ['The metadata for this entity type (profile) is not valid.', "must have required property 'avatars'"]
    })
  })

  it('When wearable metadata is wrong, deployment result should include the proper error', async () => {
    const { components } = server
    const expectedErrors = [
      'The metadata for this entity type (wearable) is not valid.',
      "must have required property 'collectionAddress'",
      "must have required property 'rarity'",
      'must pass "_isThirdParty" keyword validation',
      'must pass "_isBaseAvatar" keyword validation',
      "must have required property 'merkleProof'",
      "must have required property 'content'",
      "must have required property 'id'",
      "must have required property 'name'",
      "must have required property 'description'",
      "must have required property 'i18n'",
      "must have required property 'thumbnail'",
      "must have required property 'image'",
      "must have required property 'data'",
      'either standard XOR thirdparty properties conditions must be met'
    ]

    const E1: EntityCombo = await buildDeployData([identity.address], {
      type: EntityType.WEARABLE,
      metadata: { a: 'metadata' },
      identity
    })

    const result = (await deployEntity(components, E1)) as InvalidResult

    expectedErrors.forEach(($) => expect(result?.errors).toContain($))
  })

  it('When wearable metadata is present but incomplete, deployment result should include the proper error', async () => {
    const { components } = server
    const expectedErrors = [
      'The metadata for this entity type (wearable) is not valid.',
      "must have required property 'collectionAddress'",
      "must have required property 'rarity'",
      'must pass "_isThirdParty" keyword validation',
      'must pass "_isBaseAvatar" keyword validation',
      "must have required property 'merkleProof'",
      "must have required property 'content'",
      "must have required property 'id'",
      "must have required property 'name'",
      "must have required property 'description'",
      "must have required property 'i18n'",
      "must have required property 'thumbnail'",
      "must have required property 'image'",
      "must have required property 'data'",
      'either standard XOR thirdparty properties conditions must be met'
    ]

    const E1: EntityCombo = await buildDeployData([identity.address], {
      type: EntityType.WEARABLE,
      metadata: {},
      identity
    })

    const result = (await deployEntity(components, E1)) as InvalidResult

    expectedErrors.forEach(($) => expect(result?.errors).toContain($))
  })

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
