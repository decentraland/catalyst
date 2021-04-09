import { DeploymentResult, isSuccessfulDeployment, MetaverseContentService } from '@katalyst/content/service/Service'
import { AuditInfo, EntityType, EntityVersion, SortingField, SortingOrder, Timestamp } from 'dcl-catalyst-commons'
import { loadStandaloneTestEnvironment } from '../../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, EntityCombo } from '../../E2ETestUtils'
/**
 * This test verifies that when getting all deployments next link is paginating correctly
 */
describe('Integration - Deployment Filters', () => {
  const P1 = 'x1,y1'
  const P2 = 'x2,y2'
  const P3 = 'x3,y3'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo

  const testEnv = loadStandaloneTestEnvironment()
  let service: MetaverseContentService

  beforeAll(async () => {
    E1 = await buildDeployData([P1], { type: EntityType.PROFILE })
    E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE })
    E3 = await buildDeployDataAfterEntity(E2, [P1, P2, P3], { type: EntityType.PROFILE })
  })

  beforeEach(async () => {
    service = await testEnv.buildService()
  })

  it('When there is no next page then the link is undefined', async () => {
    // Deploy E1, E2 and E3 in that orderawait deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 3
    })

    const nextLink = actualDeployments.pagination.next

    expect(nextLink).toBeUndefined()
  })

  it('When lastEntityId is sent, it stills orders by timestamp', async () => {
    // Deploy E1, E2 and E3 in that order
    const [, E2Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2,
      lastEntityId: E1.entity.id
    })

    const nextLink = actualDeployments.pagination.next

    expect(nextLink).toContain(`toLocalTimestamp=${E2Timestamp.toString()}`)
    expect(nextLink).toContain(`lastEntityId=${E2.entity.id}`)
    expect(actualDeployments.pagination.lastEntityId).toBe(E1.entity.id)
  })

  it('When local timestamp filter is set, then in next only to is modified', async () => {
    // Deploy E1, E2 and E3 in that order
    const [E1Timestamp, E2Timestamp, E3Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2,
      filters: { fromLocalTimestamp: E1Timestamp, toLocalTimestamp: E3Timestamp }
    })

    const nextLink = actualDeployments.pagination.next

    expect(nextLink).toContain(`fromLocalTimestamp=${E1Timestamp.toString()}`)
    expect(nextLink).toContain(`toLocalTimestamp=${E2Timestamp.toString()}`)
    expect(nextLink).toContain(`lastEntityId=${E2.entity.id}`)
  })

  it('When local timestamp filter is set with asc order, then in next only from is modified', async () => {
    // Deploy E1, E2 and E3 in that order
    const [E1Timestamp, E2Timestamp, E3Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2,
      sortBy: {
        order: SortingOrder.ASCENDING
      },
      filters: { fromLocalTimestamp: E1Timestamp, toLocalTimestamp: E3Timestamp }
    })

    const nextLink = actualDeployments.pagination.next

    expect(nextLink).toContain(`fromLocalTimestamp=${E2Timestamp.toString()}`)
    expect(nextLink).toContain(`toLocalTimestamp=${E3Timestamp.toString()}`)
    expect(nextLink).toContain(`lastEntityId=${E2.entity.id}`)
  })

  it('When limit is set, then in next it persists', async () => {
    // Deploy E1, E2 and E3 in that order
    await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2
    })

    const nextLink = actualDeployments.pagination.next

    expect(nextLink).toContain('limit=2')
  })

  it('When order is by entity timestamp, then in next only toEntityTimestamp is modified', async () => {
    // Deploy E1, E2 and E3 in that order
    const [E1Timestamp, , E3Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2,
      sortBy: {
        field: SortingField.ENTITY_TIMESTAMP
      },
      filters: { fromLocalTimestamp: E1Timestamp, toLocalTimestamp: E3Timestamp }
    })

    const nextLink = actualDeployments.pagination.next

    expect(nextLink).toContain(`fromLocalTimestamp=${E1Timestamp.toString()}`)
    expect(nextLink).toContain(`toLocalTimestamp=${E3Timestamp.toString()}`)
    expect(nextLink).toContain(`toEntityTimestamp=${E2.entity.timestamp.toString()}`)
    expect(nextLink).toContain(`lastEntityId=${E2.entity.id}`)
  })

  async function deploy(...entities: EntityCombo[]): Promise<Timestamp[]> {
    return deployWithAuditInfo(entities, {})
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
