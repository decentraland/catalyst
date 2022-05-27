import { AuditInfo, EntityType } from 'dcl-catalyst-commons'
import { AppComponents } from '../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'
import { buildDeployData, deployEntitiesCombo, EntityCombo } from '../E2ETestUtils'

/**
 * This test verifies that the entities with the same entity timestamp are deployed correctly
 */
loadStandaloneTestEnvironment()('Integration - Same Timestamp Check', (testEnv) => {
  const P1 = 'X1,Y1'
  const type = EntityType.PROFILE
  let oldestEntity: EntityCombo, newestEntity: EntityCombo

  beforeAll(async () => {
    const timestamp = Date.now()
    const e1 = await buildDeployData([P1], { type, timestamp, metadata: 'metadata1' })
    const e2 = await buildDeployData([P1], { type, timestamp, metadata: 'metadata2' })
    if (e1.entity.id.toLowerCase() < e2.entity.id.toLowerCase()) {
      oldestEntity = e1
      newestEntity = e2
    } else {
      oldestEntity = e2
      newestEntity = e1
    }
  })

  testCaseWithComponents(
    testEnv,
    `When oldest is deployed first, they overwrites are calculated correctly correctly`,
    async ({ deployer, validator, serverValidator }) => {
      // make noop validator
      makeNoopValidator({ validator })
      makeNoopServerValidator({ serverValidator })

      // Deploy the entities
      await deployEntitiesCombo(deployer, oldestEntity)
      await deployEntitiesCombo(deployer, newestEntity)

      // Verify overwrites
      await assertOverwrittenBy(deployer, oldestEntity, newestEntity)
      await assertNotOverwritten(deployer, newestEntity)

      // Assert newest entity is active
      await assertIsActive(deployer, newestEntity)
    }
  )

  testCaseWithComponents(
    testEnv,
    `When newest is deployed first, they overwrites are calculated correctly correctly`,
    async ({ deployer, validator, serverValidator }) => {
      // make noop validator
      makeNoopValidator({ validator })
      makeNoopServerValidator({ serverValidator })
      // Deploy the entities
      await deployEntitiesCombo(deployer, newestEntity)
      await deployEntitiesCombo(deployer, oldestEntity)

      // Verify overwrites
      await assertOverwrittenBy(deployer, oldestEntity, newestEntity)
      await assertNotOverwritten(deployer, newestEntity)

      // Assert newest entity is active
      await assertIsActive(deployer, newestEntity)
    }
  )

  async function assertIsActive(deployer: AppComponents['deployer'], entityCombo: EntityCombo) {
    const { deployments } = await deployer.getDeployments({
      filters: { entityIds: [entityCombo.controllerEntity.id], onlyCurrentlyPointed: true }
    })
    expect(deployments.length).toEqual(1)
    const [activeEntity] = deployments
    expect(activeEntity.entityId).toEqual(entityCombo.entity.id)
  }

  async function assertOverwrittenBy(
    deployer: AppComponents['deployer'],
    overwritten: EntityCombo,
    overwrittenBy: EntityCombo
  ) {
    const auditInfo = await getAuditInfo(deployer, overwritten)
    expect(auditInfo?.overwrittenBy).toEqual(overwrittenBy.entity.id)
  }

  async function assertNotOverwritten(deployer: AppComponents['deployer'], entity: EntityCombo) {
    const auditInfo = await getAuditInfo(deployer, entity)
    expect(auditInfo?.overwrittenBy).toBeUndefined()
  }

  async function getAuditInfo(deployer: AppComponents['deployer'], entity: EntityCombo): Promise<AuditInfo> {
    const { deployments } = await deployer.getDeployments({
      filters: {
        entityTypes: [entity.controllerEntity.type],
        entityIds: [entity.controllerEntity.id]
      }
    })
    return deployments[0].auditInfo
  }
})
