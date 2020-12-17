import { MetaverseContentService } from '@katalyst/content/service/Service'
import { AuditInfo, EntityType } from 'dcl-catalyst-commons'
import { loadTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData, deployEntitiesCombo, EntityCombo } from '../E2ETestUtils'

/**
 * This test verifies that the entities with the same entity timestamp are deployed correctly
 */
describe('Integration - Same Timestamp Check', () => {
  const P1 = 'X1,Y1'
  const type = EntityType.PROFILE
  let oldestEntity: EntityCombo, newestEntity: EntityCombo

  const testEnv = loadTestEnvironment()
  let service: MetaverseContentService

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

  beforeEach(async () => {
    service = await testEnv.buildService()
  })

  it(`When oldest is deployed first, they overwrites are calculated correctly correctly`, async () => {
    // Deploy the entities
    await deployEntitiesCombo(service, oldestEntity)
    await deployEntitiesCombo(service, newestEntity)

    // Verify overwrites
    await assertOverwrittenBy(oldestEntity, newestEntity)
    await assertNotOverwritten(newestEntity)

    // Assert newest entity is active
    await assertIsActive(newestEntity)
  })

  it(`When newest is deployed first, they overwrites are calculated correctly correctly`, async () => {
    // Deploy the entities
    await deployEntitiesCombo(service, newestEntity)
    await deployEntitiesCombo(service, oldestEntity)

    // Verify overwrites
    await assertOverwrittenBy(oldestEntity, newestEntity)
    await assertNotOverwritten(newestEntity)

    // Assert newest entity is active
    await assertIsActive(newestEntity)
  })

  async function assertIsActive(entityCombo: EntityCombo) {
    const { deployments } = await service.getDeployments({
      filters: { entityIds: [entityCombo.controllerEntity.id], onlyCurrentlyPointed: true }
    })
    expect(deployments.length).toEqual(1)
    const [activeEntity] = deployments
    expect(activeEntity.entityId).toEqual(entityCombo.entity.id)
  }

  async function assertOverwrittenBy(overwritten: EntityCombo, overwrittenBy: EntityCombo) {
    const auditInfo = await getAuditInfo(overwritten)
    expect(auditInfo?.overwrittenBy).toEqual(overwrittenBy.entity.id)
  }

  async function assertNotOverwritten(entity: EntityCombo) {
    const auditInfo = await getAuditInfo(entity)
    expect(auditInfo?.overwrittenBy).toBeUndefined()
  }

  async function getAuditInfo(entity: EntityCombo): Promise<AuditInfo> {
    const { deployments } = await service.getDeployments({
      filters: { entityTypes: [entity.controllerEntity.type], entityIds: [entity.controllerEntity.id] }
    })
    return deployments[0].auditInfo
  }
})
