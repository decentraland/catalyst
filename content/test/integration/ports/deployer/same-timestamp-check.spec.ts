import { EntityType } from '@dcl/schemas'
import { getDeployments } from '../../../../src/logic/deployments'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment, testCaseWithComponents } from '../../E2ETestEnvironment'
import { buildDeployData, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'

/**
 * This test verifies that the entities with the same entity timestamp are deployed correctly
 */
describe('Integration - Same Timestamp Check', () => {
  const getTestEnv = setupTestEnvironment()

  const P1 = 'X1,Y1'
  const type = EntityType.PROFILE
  let oldestEntity: EntityCombo, newestEntity: EntityCombo

  beforeAll(async () => {
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

  testCaseWithComponents(
    getTestEnv,
    `When oldest is deployed first, the active is the newest`,
    async ({ deployer, validator, serverValidator, database, denylist, metrics }) => {
      // make noop validator
      makeNoopValidator({ validator })
      makeNoopServerValidator({ serverValidator })

      // Deploy the entities
      await deployEntitiesCombo(deployer, oldestEntity)
      await deployEntitiesCombo(deployer, newestEntity)

      // Assert newest entity is active
      await assertIsActive({ database, denylist, metrics }, newestEntity)
    }
  )

  testCaseWithComponents(
    getTestEnv,
    `When newest is deployed first, the active is the newest`,
    async ({ deployer, validator, serverValidator, database, denylist, metrics }) => {
      // make noop validator
      makeNoopValidator({ validator })
      makeNoopServerValidator({ serverValidator })
      // Deploy the entities
      await deployEntitiesCombo(deployer, newestEntity)
      await deployEntitiesCombo(deployer, oldestEntity)

      // Assert newest entity is active
      await assertIsActive({ database, denylist, metrics }, newestEntity)
    }
  )

  async function assertIsActive(
    components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
    entityCombo: EntityCombo
  ) {
    const { deployments } = await getDeployments(components, components.database, {
      filters: { entityIds: [entityCombo.controllerEntity.id], onlyCurrentlyPointed: true }
    })
    expect(deployments.length).toEqual(1)
    const [activeEntity] = deployments
    expect(activeEntity.entityId).toEqual(entityCombo.entity.id)
  }
})
