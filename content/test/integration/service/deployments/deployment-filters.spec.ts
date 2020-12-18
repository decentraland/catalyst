import { ExtendedDeploymentFilters } from '@katalyst/content/service/deployments/DeploymentManager'
import { DeploymentResult, isSuccessfulDeployment, MetaverseContentService } from '@katalyst/content/service/Service'
import { AuditInfo, EntityType, EntityVersion, Timestamp } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import { loadTestEnvironmentWithoutSynchronization } from '../../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, EntityCombo } from '../../E2ETestUtils'

/**
 * This test verifies that all deployment filters are working correctly
 */
describe('Integration - Deployment Filters', () => {
  const P1 = 'x1,y1'
  const P2 = 'x2,y2'
  const P3 = 'x3,y3'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo

  const testEnv = loadTestEnvironmentWithoutSynchronization()
  let service: MetaverseContentService

  beforeAll(async () => {
    E1 = await buildDeployData([P1], { type: EntityType.PROFILE })
    E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE })
    E3 = await buildDeployDataAfterEntity(E2, [P1, P2, P3], { type: EntityType.PROFILE })
  })

  beforeEach(async () => {
    service = await testEnv.buildService()
  })

  it('When local timestamp filter is set, then results are calculated correctly', async () => {
    // Deploy E1 and E2
    const [E1Timestamp, E2Timestamp] = await deploy(E1, E2)

    // Deploy E3 with origin timestamp set between E1 and E2
    const [E3Timestamp] = await deployWithOrigin((E1Timestamp + E2Timestamp) / 2, '', E3)

    await assertDeploymentsWithFilterAre({}, E1, E2, E3)
    await assertDeploymentsWithFilterAre({ fromLocalTimestamp: E1Timestamp, toLocalTimestamp: E2Timestamp }, E1, E2)
    await assertDeploymentsWithFilterAre({ fromLocalTimestamp: E2Timestamp }, E2, E3)
    await assertDeploymentsWithFilterAre({ fromLocalTimestamp: E3Timestamp + 1 })
  })

  it('When origin timestamp filter is set, then results are calculated correctly', async () => {
    // Deploy E1 and E2
    const [E1Timestamp, E2Timestamp] = await deploy(E1, E2)

    // Deploy E3 with origin timestamp set between E1 and E2
    const betweenE1AndE2 = (E1Timestamp + E2Timestamp) / 2
    await deployWithOrigin(betweenE1AndE2, '', E3)

    await assertDeploymentsWithFilterAre({}, E1, E2, E3)
    await assertDeploymentsWithFilterAre(
      { fromOriginTimestamp: E1Timestamp, toOriginTimestamp: E2Timestamp },
      E1,
      E2,
      E3
    )
    await assertDeploymentsWithFilterAre({ fromOriginTimestamp: betweenE1AndE2 }, E2, E3)
    await assertDeploymentsWithFilterAre({ fromOriginTimestamp: betweenE1AndE2 }, E2, E3)
    await assertDeploymentsWithFilterAre({ fromOriginTimestamp: E2Timestamp + 1 })
  })

  it('When origin server url filter is set, then results are calculated correctly', async () => {
    const serverUrl = 'some-server-url'

    // Deploy E1
    await deploy(E1)

    // Deploy E2
    await deployWithOrigin(Date.now(), serverUrl, E2)

    await assertDeploymentsWithFilterAre({}, E1, E2)
    await assertDeploymentsWithFilterAre({ originServerUrl: 'something' })
    await assertDeploymentsWithFilterAre({ originServerUrl: serverUrl }, E2)
  })

  it('When entity types filter is set, then results are calculated correctly', async () => {
    // Deploy E1 and E2
    await deploy(E1, E2)

    await assertDeploymentsWithFilterAre({}, E1, E2)
    await assertDeploymentsWithFilterAre({ entityTypes: [EntityType.PROFILE] }, E1)
    await assertDeploymentsWithFilterAre({ entityTypes: [EntityType.SCENE] }, E2)
    await assertDeploymentsWithFilterAre({ entityTypes: [EntityType.PROFILE, EntityType.SCENE] }, E1, E2)
  })

  it('When entity ids filter is set, then results are calculated correctly', async () => {
    // Deploy E1 and E2
    await deploy(E1, E2)

    await assertDeploymentsWithFilterAre({}, E1, E2)
    await assertDeploymentsWithFilterAre({ entityIds: [E1.entity.id] }, E1)
    await assertDeploymentsWithFilterAre({ entityIds: [E2.entity.id] }, E2)
    await assertDeploymentsWithFilterAre({ entityIds: [E1.entity.id, E2.entity.id] }, E1, E2)
  })

  it('When deployed by filter is set, then results are calculated correctly', async () => {
    const identity1 = 'some-identity'
    const identity2 = 'another-identity'

    // Deploy E1 and E2
    await deployWithIdentity(identity1, E1)
    await deployWithIdentity(identity2, E2)

    await assertDeploymentsWithFilterAre({}, E1, E2)
    await assertDeploymentsWithFilterAre({ deployedBy: [identity1] }, E1)
    await assertDeploymentsWithFilterAre({ deployedBy: [identity2] }, E2)
    await assertDeploymentsWithFilterAre({ deployedBy: [identity1, identity2] }, E1, E2)
    await assertDeploymentsWithFilterAre({ deployedBy: ['not-and-identity'] })
  })

  it('When deployed by filter is set, then results are calculated correctly', async () => {
    await deploy(E1, E2, E3)

    await assertDeploymentsWithFilterAre({}, E1, E2, E3)
    await assertDeploymentsWithFilterAre({ onlyCurrentlyPointed: true }, E2, E3)
    await assertDeploymentsWithFilterAre({ onlyCurrentlyPointed: false }, E1, E2, E3)
  })

  it('When pointers filter is set, then results are calculated correctly', async () => {
    await deploy(E1, E2, E3)

    await assertDeploymentsWithFilterAre({}, E1, E2, E3)
    await assertDeploymentsWithFilterAre({ pointers: [P1] }, E1, E3)
    await assertDeploymentsWithFilterAre({ pointers: [P2] }, E2, E3)
    await assertDeploymentsWithFilterAre({ pointers: [P3] }, E3)
    await assertDeploymentsWithFilterAre({ pointers: [P1, P2, P3] }, E1, E2, E3)
  })

  it('When pointers filter is set, then results are calculated case insensitive', async () => {
    await deploy(E1, E2, E3)

    const upperP1 = 'X1,Y1'
    const upperP2 = 'X2,Y2'
    const upperP3 = 'X3,Y3'

    await assertDeploymentsWithFilterAre({ pointers: [upperP1] }, E1, E3)
    await assertDeploymentsWithFilterAre({ pointers: [upperP2] }, E2, E3)
    await assertDeploymentsWithFilterAre({ pointers: [upperP3] }, E3)
    await assertDeploymentsWithFilterAre({ pointers: [upperP1, upperP2, upperP3] }, E1, E2, E3)
  })

  async function assertDeploymentsWithFilterAre(filter: ExtendedDeploymentFilters, ...expectedEntities: EntityCombo[]) {
    const actualDeployments = await service.getDeployments({ filters: filter })
    const expectedEntityIds = expectedEntities.map((entityCombo) => entityCombo.entity.id).sort()
    const actualEntityIds = actualDeployments.deployments.map(({ entityId }) => entityId).sort()
    expect(actualEntityIds).toEqual(expectedEntityIds)
  }

  async function deploy(...entities: EntityCombo[]): Promise<Timestamp[]> {
    return deployWithAuditInfo(entities, {})
  }

  async function deployWithOrigin(
    originTimestamp: Timestamp,
    originServerUrl: string,
    ...entities: EntityCombo[]
  ): Promise<Timestamp[]> {
    return deployWithAuditInfo(entities, { originTimestamp, originServerUrl })
  }

  async function deployWithIdentity(deployedBy: string, ...entities: EntityCombo[]): Promise<Timestamp[]> {
    const authChain = Authenticator.createSimpleAuthChain('', deployedBy, '')
    return deployWithAuditInfo(entities, { authChain })
  }

  async function deployWithAuditInfo(entities: EntityCombo[], overrideAuditInfo?: Partial<AuditInfo>) {
    const result: Timestamp[] = []
    for (const { deployData } of entities) {
      const newAuditInfo = { version: EntityVersion.V2, authChain: deployData.authChain, ...overrideAuditInfo }
      const deploymentResult: DeploymentResult = await service.deployEntity(
        Array.from(deployData.files.values()),
        deployData.entityId,
        newAuditInfo,
        ''
      )
      if (isSuccessfulDeployment(deploymentResult)) {
        result.push(deploymentResult)
      }
    }
    return result
  }
})
