import { EntityType } from '@dcl/schemas'
import { getDeployments } from '../../../../src/logic/deployments'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { buildDeployData, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'
import { TestProgram } from '../../TestProgram'
import { createDefaultServer } from '../../simpleTestEnvironment'

const P1 = 'X1,Y1'
const type = EntityType.PROFILE
/**
 * This test verifies that the entities with the same entity timestamp are deployed correctly
 */
describe('Integration - Same Timestamp Check', () => {
  let oldestEntity: EntityCombo, newestEntity: EntityCombo
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
    makeNoopServerValidator(server.components)

    const timestamp = Date.now()
    const e1 = await buildDeployData([P1], { type, timestamp, metadata: { a: 'metadata1' } })
    const e2 = await buildDeployData([P1], { type, timestamp, metadata: { a: 'metadata2' } })
    if (e1.entity.id.toLowerCase() < e2.entity.id.toLowerCase()) {
      oldestEntity = e1
      newestEntity = e2
    } else {
      oldestEntity = e2
      newestEntity = e1
    }
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
    server = null as any
  })

  it(`When oldest is deployed first, the active is the newest`, async () => {
    const { deployer, database, denylist, metrics } = server.components

    // Deploy the entities
    await deployEntitiesCombo(deployer, oldestEntity)
    await deployEntitiesCombo(deployer, newestEntity)

    // Assert newest entity is active
    await assertIsActive({ database, denylist, metrics }, newestEntity)
  })

  it(`When newest is deployed first, the active is the newest`, async () => {
    const { deployer, database, denylist, metrics } = server.components
    // Deploy the entities
    await deployEntitiesCombo(deployer, newestEntity)
    await deployEntitiesCombo(deployer, oldestEntity)

    // Assert newest entity is active
    await assertIsActive({ database, denylist, metrics }, newestEntity)
  })

  async function assertIsActive(
    components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
    entityCombo: EntityCombo
  ) {
    const { deployments } = await getDeployments(components, components.database, {
      filters: { entityIds: [entityCombo.entity.id], onlyCurrentlyPointed: true }
    })
    expect(deployments.length).toEqual(1)
    const [activeEntity] = deployments
    expect(activeEntity.entityId).toEqual(entityCombo.entity.id)
  }
})
