import { EntityType } from '@dcl/schemas'
import {
  AuditInfo,
  DeploymentContext,
  DeploymentFilters,
  DeploymentResult,
  isInvalidDeployment,
  isSuccessfulDeployment
} from '../../../../src/deployment-types'
import { getDeployments } from '../../../../src/logic/deployments'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { buildDeployData, buildDeployDataAfterEntity, EntityCombo } from '../../E2ETestUtils'
import { TestProgram } from '../../TestProgram'
import LeakDetector from 'jest-leak-detector'
import { createDefaultServer, resetServer } from '../../simpleTestEnvironment'

const P1 = 'x1,y1'
const P2 = 'x2,y2'
const P3 = 'x3,y3'
/**
 * This test verifies that all deployment filters are working correctly
 */
describe('Integration - Deployment Filters', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
    makeNoopServerValidator(server.components)
  })

  beforeEach(async () => {
    await resetServer(server)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo

  it('creates and deploys the initial entities', async () => {
    E1 = await buildDeployData([P1], { type: EntityType.PROFILE, metadata: { a: 'metadata' } })
    E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE, metadata: { a: 'metadata' } })
    E3 = await buildDeployDataAfterEntity(E2, [P1, P2, P3], { type: EntityType.PROFILE, metadata: { a: 'metadata' } })
  })

  it('When local timestamp filter is set, then results are calculated correctly', async () => {
    const { components } = server
    // Deploy E1, E2 and E3
    const [E1Timestamp, E2Timestamp, E3Timestamp] = await deploy(components, E1, E2, E3)

    await assertDeploymentsWithFilterAre(components, {}, E1, E2, E3)
    await assertDeploymentsWithFilterAre(components, { from: E1Timestamp, to: E2Timestamp }, E1, E2)
    await assertDeploymentsWithFilterAre(components, { from: E2Timestamp }, E2, E3)
    await assertDeploymentsWithFilterAre(components, { from: E3Timestamp + 1 })
  })

  it('When entity types filter is set, then results are calculated correctly', async () => {
    const { components } = server
    // Deploy E1 and E2
    await deploy(components, E1, E2)

    await assertDeploymentsWithFilterAre(components, {}, E1, E2)
    await assertDeploymentsWithFilterAre(components, { entityTypes: [EntityType.PROFILE] }, E1)
    await assertDeploymentsWithFilterAre(components, { entityTypes: [EntityType.SCENE] }, E2)
    await assertDeploymentsWithFilterAre(components, { entityTypes: [EntityType.PROFILE, EntityType.SCENE] }, E1, E2)
  })

  it('When entity ids filter is set, then results are calculated correctly', async () => {
    const { components } = server
    // Deploy E1 and E2
    await deploy(components, E1, E2)

    await assertDeploymentsWithFilterAre(components, {}, E1, E2)
    await assertDeploymentsWithFilterAre(components, { entityIds: [E1.entity.id] }, E1)
    await assertDeploymentsWithFilterAre(components, { entityIds: [E2.entity.id] }, E2)
    await assertDeploymentsWithFilterAre(components, { entityIds: [E1.entity.id, E2.entity.id] }, E1, E2)
  })

  it('When pointers filter is set, then results are calculated correctly', async () => {
    const { components } = server
    await deploy(components, E1, E2, E3)

    await assertDeploymentsWithFilterAre(components, {}, E1, E2, E3)
    await assertDeploymentsWithFilterAre(components, { pointers: [P1] }, E1, E3)
    await assertDeploymentsWithFilterAre(components, { pointers: [P2] }, E2, E3)
    await assertDeploymentsWithFilterAre(components, { pointers: [P3] }, E3)
    await assertDeploymentsWithFilterAre(components, { pointers: [P1, P2, P3] }, E1, E2, E3)
  })

  it('When pointers filter is set, then results are calculated case insensitive', async () => {
    const { components } = server
    await deploy(components, E1, E2, E3)
    const upperP1 = 'X1,Y1'
    const upperP2 = 'X2,Y2'
    const upperP3 = 'X3,Y3'

    await assertDeploymentsWithFilterAre(components, { pointers: [upperP1] }, E1, E3)
    await assertDeploymentsWithFilterAre(components, { pointers: [upperP2] }, E2, E3)
    await assertDeploymentsWithFilterAre(components, { pointers: [upperP3] }, E3)
    await assertDeploymentsWithFilterAre(components, { pointers: [upperP1, upperP2, upperP3] }, E1, E2, E3)
  })

  async function assertDeploymentsWithFilterAre(
    components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
    filter: DeploymentFilters,
    ...expectedEntities: EntityCombo[]
  ) {
    const actualDeployments = await getDeployments(components, components.database, { filters: filter })
    const expectedEntityIds = expectedEntities.map((entityCombo) => entityCombo.entity.id).sort()
    const actualEntityIds = actualDeployments.deployments.map(({ entityId }) => entityId).sort()
    expect({ filter, deployedEntityIds: actualEntityIds }).toEqual({ filter, deployedEntityIds: expectedEntityIds })
  }

  async function deploy(components: Pick<AppComponents, 'deployer'>, ...entities: EntityCombo[]): Promise<number[]> {
    return deployWithAuditInfo(components, entities, {})
  }

  async function deployWithAuditInfo(
    components: Pick<AppComponents, 'deployer'>,
    entities: EntityCombo[],
    overrideAuditInfo?: Partial<AuditInfo>
  ) {
    const timestamps: number[] = []
    for (const { deployData } of entities) {
      const newAuditInfo = { version: 'v3', authChain: deployData.authChain, ...overrideAuditInfo }
      const deploymentResult: DeploymentResult = await components.deployer.deployEntity(
        Array.from(deployData.files.values()),
        deployData.entityId,
        newAuditInfo,
        DeploymentContext.LOCAL
      )
      if (isSuccessfulDeployment(deploymentResult)) {
        timestamps.push(deploymentResult)
      } else if (isInvalidDeployment(deploymentResult)) {
        throw new Error(deploymentResult.errors.join(','))
      } else {
        throw new Error('deployEntity returned invalid result' + JSON.stringify(deploymentResult))
      }
    }
    return timestamps
  }
})
