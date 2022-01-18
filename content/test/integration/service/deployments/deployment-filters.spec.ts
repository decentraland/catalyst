import { AuditInfo, DeploymentFilters, EntityType, EntityVersion, Timestamp } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import { DeploymentContext, DeploymentResult, isSuccessfulDeployment } from '../../../../src/service/Service'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, EntityCombo } from '../../E2ETestUtils'

/**
 * This test verifies that all deployment filters are working correctly
 */
loadStandaloneTestEnvironment()('Integration - Deployment Filters', (testEnv) => {
  const P1 = 'x1,y1'
  const P2 = 'x2,y2'
  const P3 = 'x3,y3'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo

  it('creates and deploys the initial entities', async () => {
    E1 = await buildDeployData([P1], { type: EntityType.PROFILE })
    E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE })
    E3 = await buildDeployDataAfterEntity(E2, [P1, P2, P3], { type: EntityType.PROFILE })
  })

  testCaseWithComponents(
    testEnv,
    'When local timestamp filter is set, then results are calculated correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      // Deploy E1, E2 and E3
      const [E1Timestamp, E2Timestamp, E3Timestamp] = await deploy(components, E1, E2, E3)

      await assertDeploymentsWithFilterAre(components, {}, E1, E2, E3)
      await assertDeploymentsWithFilterAre(components, { from: E1Timestamp, to: E2Timestamp }, E1, E2)
      await assertDeploymentsWithFilterAre(components, { from: E2Timestamp }, E2, E3)
      await assertDeploymentsWithFilterAre(components, { from: E3Timestamp + 1 })
    }
  )

  testCaseWithComponents(
    testEnv,
    'When entity types filter is set, then results are calculated correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      // Deploy E1 and E2
      await deploy(components, E1, E2)

      await assertDeploymentsWithFilterAre(components, {}, E1, E2)
      await assertDeploymentsWithFilterAre(components, { entityTypes: [EntityType.PROFILE] }, E1)
      await assertDeploymentsWithFilterAre(components, { entityTypes: [EntityType.SCENE] }, E2)
      await assertDeploymentsWithFilterAre(components, { entityTypes: [EntityType.PROFILE, EntityType.SCENE] }, E1, E2)
    }
  )

  testCaseWithComponents(
    testEnv,
    'When entity ids filter is set, then results are calculated correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      // Deploy E1 and E2
      await deploy(components, E1, E2)

      await assertDeploymentsWithFilterAre(components, {}, E1, E2)
      await assertDeploymentsWithFilterAre(components, { entityIds: [E1.entity.id] }, E1)
      await assertDeploymentsWithFilterAre(components, { entityIds: [E2.entity.id] }, E2)
      await assertDeploymentsWithFilterAre(components, { entityIds: [E1.entity.id, E2.entity.id] }, E1, E2)
    }
  )

  testCaseWithComponents(
    testEnv,
    'When deployed by filter is set, then results are calculated ignoring the casing',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      const identity1 = 'Some-Identity'
      const identity2 = 'another-identity'

      // Deploy E1 and E2
      await deployWithIdentity(components, identity1, E1)
      await deployWithIdentity(components, identity2, E2)

      await assertDeploymentsWithFilterAre(components, {}, E1, E2)
      await assertDeploymentsWithFilterAre(components, { deployedBy: [identity1] }, E1)
      await assertDeploymentsWithFilterAre(components, { deployedBy: [identity1.toLowerCase()] }, E1)
      await assertDeploymentsWithFilterAre(components, { deployedBy: [identity2] }, E2)
      await assertDeploymentsWithFilterAre(components, { deployedBy: [identity1, identity2] }, E1, E2)
      await assertDeploymentsWithFilterAre(components, { deployedBy: ['not-and-identity'] })
    }
  )

  testCaseWithComponents(
    testEnv,
    'When deployed by filter is set, then results are calculated correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      await deploy(components, E1, E2, E3)

      await assertDeploymentsWithFilterAre(components, {}, E1, E2, E3)
      await assertDeploymentsWithFilterAre(components, { onlyCurrentlyPointed: true }, E2, E3)
      await assertDeploymentsWithFilterAre(components, { onlyCurrentlyPointed: false }, E1, E2, E3)
    }
  )

  testCaseWithComponents(
    testEnv,
    'When pointers filter is set, then results are calculated correctly',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      await deploy(components, E1, E2, E3)

      await assertDeploymentsWithFilterAre(components, {}, E1, E2, E3)
      await assertDeploymentsWithFilterAre(components, { pointers: [P1] }, E1, E3)
      await assertDeploymentsWithFilterAre(components, { pointers: [P2] }, E2, E3)
      await assertDeploymentsWithFilterAre(components, { pointers: [P3] }, E3)
      await assertDeploymentsWithFilterAre(components, { pointers: [P1, P2, P3] }, E1, E2, E3)
    }
  )

  testCaseWithComponents(
    testEnv,
    'When pointers filter is set, then results are calculated case insensitive',
    async (components) => {
      // make noop validator
      makeNoopValidator(components)
      makeNoopServerValidator(components)

      const deployments = await deploy(components, E1, E2, E3)
      console.dir({ deployments })
      const upperP1 = 'X1,Y1'
      const upperP2 = 'X2,Y2'
      const upperP3 = 'X3,Y3'

      await assertDeploymentsWithFilterAre(components, { pointers: [upperP1] }, E1, E3)
      await assertDeploymentsWithFilterAre(components, { pointers: [upperP2] }, E2, E3)
      await assertDeploymentsWithFilterAre(components, { pointers: [upperP3] }, E3)
      await assertDeploymentsWithFilterAre(components, { pointers: [upperP1, upperP2, upperP3] }, E1, E2, E3)
    }
  )

  async function assertDeploymentsWithFilterAre(
    components: Pick<AppComponents, 'deployer'>,
    filter: DeploymentFilters,
    ...expectedEntities: EntityCombo[]
  ) {
    const actualDeployments = await components.deployer.getDeployments({ filters: filter })
    const expectedEntityIds = expectedEntities.map((entityCombo) => entityCombo.entity.id).sort()
    const actualEntityIds = actualDeployments.deployments.map(({ entityId }) => entityId).sort()
    expect({ filter, deployedEntityIds: actualEntityIds }).toEqual({ filter, deployedEntityIds: expectedEntityIds })
  }

  async function deploy(components: Pick<AppComponents, 'deployer'>, ...entities: EntityCombo[]): Promise<Timestamp[]> {
    return deployWithAuditInfo(components, entities, {})
  }

  async function deployWithIdentity(
    components: Pick<AppComponents, 'deployer'>,
    deployedBy: string,
    ...entities: EntityCombo[]
  ): Promise<Timestamp[]> {
    const authChain = Authenticator.createSimpleAuthChain('', deployedBy, '')
    return deployWithAuditInfo(components, entities, { authChain })
  }

  async function deployWithAuditInfo(
    components: Pick<AppComponents, 'deployer'>,
    entities: EntityCombo[],
    overrideAuditInfo?: Partial<AuditInfo>
  ) {
    const result: Timestamp[] = []
    for (const { deployData } of entities) {
      const newAuditInfo = { version: EntityVersion.V3, authChain: deployData.authChain, ...overrideAuditInfo }
      const deploymentResult: DeploymentResult = await components.deployer.deployEntity(
        Array.from(deployData.files.values()),
        deployData.entityId,
        newAuditInfo,
        DeploymentContext.LOCAL
      )
      if (isSuccessfulDeployment(deploymentResult)) {
        result.push(deploymentResult)
      } else {
        throw new Error(deploymentResult.errors.join(','))
      }
    }
    return result
  }
})
