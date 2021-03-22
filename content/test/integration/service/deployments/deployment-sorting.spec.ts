import { Deployment, EntityType, SortingField, SortingOrder, Timestamp } from 'dcl-catalyst-commons'
import ms from 'ms'
import { assertDeploymentsCount } from '../../E2EAssertions'
import { loadTestEnvironment } from '../../E2ETestEnvironment'
import { awaitUntil, buildDeployData, buildDeployDataAfterEntity } from '../../E2ETestUtils'
import { TestServer } from '../../TestServer'

/**
 * This test verifies that all deployment sorting params are working correctly
 */
describe('Integration - Deployment Sorting', () => {
  const SYNC_INTERVAL: number = ms('0.5s')
  const testEnv = loadTestEnvironment()
  let server1: TestServer, server2: TestServer

  beforeEach(async () => {
    ;[server1, server2] = await testEnv.configServer(SYNC_INTERVAL).andBuildMany(2)
    // Start server 1, 2 and 3
    await Promise.all([server1.start(), server2.start()])

    // Prepare data to be deployed
    const { deployData: deployData1, controllerEntity: entity1 } = await buildDeployData(['X1,Y1', 'X2,Y2'], {
      metadata: 'metadata'
    })
    const { deployData: deployData2, controllerEntity: entity2 } = await buildDeployDataAfterEntity(
      entity1,
      ['X2,Y2', 'X3,Y3'],
      { metadata: 'metadata2' }
    )
    const { deployData: deployData3 } = await buildDeployDataAfterEntity(entity2, ['X3,Y3', 'X4,Y4'], {
      metadata: 'metadata3'
    })

    // Deploy the entities 1, 2 and 3
    await server1.deploy(deployData1)
    await server2.deploy(deployData2)
    await server1.deploy(deployData3)

    await awaitUntil(() => assertDeploymentsCount(server1, 3))
  })

  it(`When getting all deployments without sortby then the order is by local and desc`, async () => {
    const deploymentsFromServer1 = await server1.getDeployments()

    assertSortedBy(deploymentsFromServer1, SortingField.LOCAL_TIMESTAMP, SortingOrder.DESCENDING)
  })

  it(`When getting all deployments with sortby by local and asc then the order is correct`, async () => {
    const deploymentsFromServer1 = await server1.getDeployments({
      filters: { entityTypes: [EntityType.SCENE] },
      sortBy: { field: SortingField.LOCAL_TIMESTAMP, order: SortingOrder.ASCENDING }
    })

    assertSortedBy(deploymentsFromServer1, SortingField.LOCAL_TIMESTAMP, SortingOrder.ASCENDING)
  })

  it(`When getting all deployments with sortby by entity and asc then the order is correct`, async () => {
    const deploymentsFromServer1 = await server1.getDeployments({
      filters: { entityTypes: [EntityType.SCENE] },
      sortBy: { field: SortingField.ENTITY_TIMESTAMP, order: SortingOrder.ASCENDING }
    })

    assertSortedBy(deploymentsFromServer1, SortingField.ENTITY_TIMESTAMP, SortingOrder.ASCENDING)
  })

  it(`When getting all deployments with sortby by entity and desc then the order is correct`, async () => {
    const deploymentsFromServer1 = await server1.getDeployments({
      filters: { entityTypes: [EntityType.SCENE] },
      sortBy: { field: SortingField.ENTITY_TIMESTAMP, order: SortingOrder.DESCENDING }
    })

    assertSortedBy(deploymentsFromServer1, SortingField.ENTITY_TIMESTAMP, SortingOrder.DESCENDING)
  })
})

const timestampExtractorMap: Map<SortingField, (deployment: Deployment) => Timestamp> = new Map([
  [SortingField.LOCAL_TIMESTAMP, (deployment) => deployment.auditInfo.localTimestamp],
  [SortingField.ENTITY_TIMESTAMP, (deployment) => deployment.entityTimestamp]
])

const compareTimestampMap: Map<SortingOrder, (timestamp1: Timestamp, timestamp2: Timestamp) => void> = new Map([
  [SortingOrder.ASCENDING, (timestamp1, timestamp2) => expect(timestamp1).toBeLessThanOrEqual(timestamp2)],
  [SortingOrder.DESCENDING, (timestamp1, timestamp2) => expect(timestamp1).toBeGreaterThanOrEqual(timestamp2)]
])

function assertSortedBy(deployments: Deployment[], field: SortingField, order: SortingOrder) {
  const timestampExtractor: (deployment: Deployment) => Timestamp = timestampExtractorMap.get(field)!
  const compareAssertion: (timestamp1: Timestamp, timestamp2: Timestamp) => void = compareTimestampMap.get(order)!

  for (let i = 1; i < deployments.length; i++) {
    const timestamp1 = timestampExtractor(deployments[i - 1])
    const timestamp2 = timestampExtractor(deployments[i])
    compareAssertion(timestamp1, timestamp2)
  }
}
