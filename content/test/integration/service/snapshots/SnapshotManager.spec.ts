import { EntityId, EntityType, Pointer } from 'dcl-catalyst-commons'
import { streamToBuffer } from 'src/storage/ContentStorage'
import { Bean, EnvironmentBuilder, EnvironmentConfig } from '../../../../src/Environment'
import { MetaverseContentService } from '../../../../src/service/Service'
import { SnapshotManager, SnapshotMetadata } from '../../../../src/service/snapshots/SnapshotManager'
import { NoOpValidator } from '../../../helpers/service/validations/NoOpValidator'
import { assertResultIsSuccessfulWithTimestamp } from '../../E2EAssertions'
import { loadStandaloneTestEnvironment } from '../../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'

describe('Integration - Snapshot Manager', () => {
  const P1 = 'X1,Y1',
    P2 = 'X2,Y2'
  let E1: EntityCombo, E2: EntityCombo, E3: EntityCombo

  const testEnv = loadStandaloneTestEnvironment()
  let service: MetaverseContentService
  let snapshotManager: SnapshotManager

  beforeAll(async () => {
    E1 = await buildDeployData([P1], { type: EntityType.SCENE })
    E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE })
    ;(E3 = await buildDeployDataAfterEntity(E2, [P1])), { type: EntityType.SCENE }
  })

  beforeEach(async () => {
    const baseEnv = await testEnv.getEnvForNewDatabase()
    const env = await new EnvironmentBuilder(baseEnv)
      .withConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY, new Map([[EntityType.SCENE, 3]]))
      .withBean(Bean.VALIDATOR, new NoOpValidator())
      .build()

    service = env.getBean(Bean.SERVICE)
    snapshotManager = env.getBean(Bean.SNAPSHOT_MANAGER)
  })

  it(`When snapshot manager starts, then a snapshot is generated if there wasn't one`, async () => {
    // Deploy E1 and E2
    const deploymentResult = await deployEntitiesCombo(service, E1, E2)

    // Assert there is no snapshot
    expect(snapshotManager.getSnapshotMetadataPerEntityType(EntityType.SCENE)).toBeUndefined()

    // Start the snapshot manager
    await snapshotManager.startSnapshotsPerEntity()

    // Assert snapshot was created
    const snapshotMetadata = snapshotManager.getSnapshotMetadataPerEntityType(EntityType.SCENE)
    expect(snapshotMetadata).toBeDefined()

    assertResultIsSuccessfulWithTimestamp(deploymentResult, snapshotMetadata!.lastIncludedDeploymentTimestamp)

    // Assert snapshot content is correct
    await assertSnapshotContains(snapshotMetadata, E1, E2)
  })

  it(`When snapshot manager starts, if there were no entities deployed, then the generated snapshot is empty`, async () => {
    // Assert there is no snapshot
    expect(snapshotManager.getSnapshotMetadataPerEntityType(EntityType.SCENE)).toBeUndefined()

    // Start the snapshot manager
    await snapshotManager.startSnapshotsPerEntity()

    // Assert snapshot was created
    const snapshotMetadata = snapshotManager.getSnapshotMetadataPerEntityType(EntityType.SCENE)
    expect(snapshotMetadata).toBeDefined()
    expect(snapshotMetadata!.lastIncludedDeploymentTimestamp).toEqual(0)

    // Assert snapshot content is empty
    await assertSnapshotContains(snapshotMetadata)
  })

  it(`When snapshot manager learns that the frequency of deployments is reached, then a new snapshot is generated`, async () => {
    // Start the snapshot manager
    await snapshotManager.startSnapshotsPerEntity()

    // Deploy E1, E2 and E3
    const lastDeploymentResult = await deployEntitiesCombo(service, E1, E2, E3)

    // Assert snapshot was created
    const snapshotMetadata = snapshotManager.getSnapshotMetadataPerEntityType(EntityType.SCENE)
    expect(snapshotMetadata).toBeDefined()
    assertResultIsSuccessfulWithTimestamp(lastDeploymentResult, snapshotMetadata!.lastIncludedDeploymentTimestamp)

    // Assert snapshot content is empty
    await assertSnapshotContains(snapshotMetadata, E2, E3)
  })

  async function assertSnapshotContains(
    snapshotMetadata: SnapshotMetadata | undefined,
    ...entitiesCombo: EntityCombo[]
  ) {
    const { hash } = snapshotMetadata!
    const content = (await service.getContent(hash))!
    const buffer = await streamToBuffer(await content.asStream())
    const snapshot: Map<EntityId, Pointer[]> = new Map(JSON.parse(buffer.toString()))
    expect(snapshot.size).toBe(entitiesCombo.length)
    for (const { entity } of entitiesCombo) {
      expect(snapshot.get(entity.id)).toEqual(entity.pointers)
    }
  }
})
