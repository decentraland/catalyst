import { DeploymentResult, isSuccessfulDeployment, MetaverseContentService } from '@katalyst/content/service/Service'
import { EntityType, EntityVersion, SortingField, SortingOrder, Timestamp } from 'dcl-catalyst-commons'
import { assert } from 'sinon'
import { loadStandaloneTestEnvironment } from '../../E2ETestEnvironment'
import { buildDeployData, EntityCombo } from '../../E2ETestUtils'
/**
 * This test verifies that when getting all deployments next link is paginating correctly
 */
describe('Integration - Deployment Pagination', () => {
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo

  const testEnv = loadStandaloneTestEnvironment()
  let service: MetaverseContentService

  beforeAll(async () => {
    const P1 = 'X1,Y1'
    const type = EntityType.PROFILE

    const timestamp = Date.now()
    const a = await buildDeployData([P1], { type, timestamp, metadata: 'metadata1' })
    const b = await buildDeployData([P1], { type, timestamp, metadata: 'metadata2' })
    if (a.entity.id.toLowerCase() < b.entity.id.toLowerCase()) {
      E1 = a
      E2 = b
    } else {
      E1 = b
      E2 = a
    }
    const laterTimestamp = Date.now()
    E3 = await buildDeployData([P1], { type, timestamp: laterTimestamp, metadata: 'metadata3' })
  })

  beforeEach(async () => {
    service = await testEnv.buildService()
  })

  it('When there is no next page then the link is undefined', async () => {
    // Deploy E1, E2 and E3 in that order
    await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 3
    })

    expect(actualDeployments.deployments.length).toBe(3)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toBeUndefined()
  })

  it('When local timestamp filter is set, then only toLocalTimestamp is modified in next ', async () => {
    // Deploy E1, E2 and E3 in that order
    const [E1Timestamp, E2Timestamp, E3Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2,
      filters: { fromLocalTimestamp: E1Timestamp, toLocalTimestamp: E3Timestamp }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`from=${E1Timestamp}`)
    expect(nextLink).toContain(`to=${E2Timestamp}`)
    expect(nextLink).toContain(`lastId=${E2.entity.id}`)
  })

  it('When local timestamp filter is set with asc order, then only fromLocalTimestamp is modified in next', async () => {
    // Deploy E1, E2 and E3 in that order
    const [E1Timestamp, E2Timestamp, E3Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2,
      sortBy: {
        order: SortingOrder.ASCENDING
      },
      filters: { fromLocalTimestamp: E1Timestamp, toLocalTimestamp: E3Timestamp }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`from=${E2Timestamp}`)
    expect(nextLink).toContain(`to=${E3Timestamp}`)
    expect(nextLink).toContain(`lastId=${E2.entity.id}`)
  })

  it('When limit is set, then in next it persists', async () => {
    // Deploy E1, E2 and E3 in that order
    await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain('limit=2')
  })

  it('When order is by entity timestamp, then only to is modified in next', async () => {
    // Deploy E1, E2 and E3 in that order
    const [E1Timestamp, , E3Timestamp] = await deploy(E1, E2, E3)

    const actualDeployments = await service.getDeployments({
      limit: 2,
      sortBy: {
        field: SortingField.ENTITY_TIMESTAMP
      },
      filters: { fromLocalTimestamp: E1Timestamp, toLocalTimestamp: E3Timestamp }
    })

    expect(actualDeployments.deployments.length).toBe(2)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).not.toContain(`fromLocalTimestamp=`)
    expect(nextLink).not.toContain(`toLocalTimestamp=`)
    expect(nextLink).not.toContain(`from=`)
    expect(nextLink).toContain(`to=${E2.entity.timestamp}`)
    expect(nextLink).toContain(`lastId=${E2.entity.id}`)
  })

  it('When order is by entity timestamp then it sorts by entityId', async () => {
    // Deploy E1, E2 in that order
    await deploy(E1, E2)

    const actualDeployments = await service.getDeployments({
      limit: 1,
      sortBy: {
        field: SortingField.ENTITY_TIMESTAMP,
        order: SortingOrder.ASCENDING
      }
    })

    expect(actualDeployments.deployments.length).toBe(1)
    const nextLink = actualDeployments.pagination.next
    expect(nextLink).toContain(`from=${E1.entity.timestamp}`)
    expect(nextLink).toContain(`lastId=${E1.entity.id}`)
  })

  it('When getting by last entityId then it returns the correct page', async () => {
    // Deploy E1, E2 in that order
    await deploy(E1, E2)

    const actualDeployments = await service.getDeployments({
      limit: 1,
      sortBy: {
        field: SortingField.ENTITY_TIMESTAMP,
        order: SortingOrder.ASCENDING
      },
      lastId: E1.entity.id,
      filters: { from: E1.entity.timestamp }
    })

    const deployments = actualDeployments.deployments

    expect(deployments.length).toBe(1)
    expect(deployments[0].entityId).toBe(`${E2.entity.id}`)
  })

  async function deploy(...entities: EntityCombo[]): Promise<Timestamp[]> {
    const result: Timestamp[] = []
    for (const { deployData } of entities) {
      const auditInfo = { version: EntityVersion.V2, authChain: deployData.authChain }
      const deploymentResult: DeploymentResult = await service.deployEntity(
        Array.from(deployData.files.values()),
        deployData.entityId,
        auditInfo,
        ''
      )
      if (isSuccessfulDeployment(deploymentResult)) {
        result.push(deploymentResult)
      } else {
        assert.fail('The deployment was not successful')
      }
    }
    return result
  }
})
