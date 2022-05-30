import { processDeploymentsInStream } from '@dcl/snapshots-fetcher/dist/file-processor'
import { EntityType } from '@dcl/schemas'
import { inspect } from 'util'
import { EnvironmentBuilder } from '../../../../src/Environment'
import { stopAllComponents } from '../../../../src/logic/components-lifecycle'
import { ContentItem } from '../../../../src/ports/contentStorage/contentStorage'
import { SnapshotMetadata } from '../../../../src/service/snapshots/SnapshotManager'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { assertResultIsSuccessfulWithTimestamp } from '../../E2EAssertions'
import { loadStandaloneTestEnvironment } from '../../E2ETestEnvironment'
import { buildDeployData, buildDeployDataAfterEntity, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'

loadStandaloneTestEnvironment()('Integration - Snapshot Manager', (testEnv) => {
  const P1 = 'X1,Y1',
    P2 = 'X2,Y2'
  let E1: EntityCombo, E2: EntityCombo

  let components: AppComponents

  beforeAll(async () => {
    E1 = await buildDeployData([P1], { type: EntityType.SCENE, metadata: {} })
    E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE, metadata: {} })
  })

  beforeEach(async () => {
    const baseEnv = await testEnv.getEnvForNewDatabase()
    components = await new EnvironmentBuilder(baseEnv).buildConfigAndComponents()
    makeNoopValidator(components)
    makeNoopServerValidator(components)
  })

  afterEach(async () => {
    await stopAllComponents(components)
  })

  /**
   * New snapshots
   */

  it(`When snapshot manager starts the full snapshots, then full snapshots are generated`, async () => {
    const { snapshotManager, deployer } = components
    // Deploy E1 and E2
    const deploymentResult = await deployEntitiesCombo(deployer, E1, E2)

    // force snapshot generation
    await snapshotManager.generateSnapshots()

    const snapshotMetadata = snapshotManager.getFullSnapshotMetadata()

    // Assert snapshot was created
    expect(snapshotMetadata).toBeDefined()
    assertResultIsSuccessfulWithTimestamp(deploymentResult, snapshotMetadata!.lastIncludedDeploymentTimestamp)
    // Assert snapshot content is correct
    await assertGZipSnapshotContains(snapshotMetadata, E1, E2)
  })

  it(`When snapshot manager starts the full snapshots, then entity type snapshots are generated`, async () => {
    const { snapshotManager, deployer } = components

    // Deploy E1 and E2 scenes
    const deploymentResult = await deployEntitiesCombo(deployer, E1, E2)

    // force snapshot generation
    await snapshotManager.generateSnapshots()

    const snapshotMetadata = snapshotManager.getFullSnapshotMetadata()

    // Assert snapshot was created
    expect(snapshotMetadata).toBeDefined()
    assertResultIsSuccessfulWithTimestamp(
      deploymentResult,
      snapshotMetadata!.entities.scene.lastIncludedDeploymentTimestamp
    )
    // Assert snapshot content is correct
    await assertGZipSnapshotContains(snapshotMetadata!.entities.scene, E1, E2)
  })

  it(`Given no deployments for entity type, When snapshot manager starts the full snapshots, then entity type snapshots is created with no timestamp`, async () => {
    const { snapshotManager, deployer } = components

    // Deploy E1 and E2 scenes
    await deployEntitiesCombo(deployer, E1, E2)

    // force snapshot generation
    await snapshotManager.generateSnapshots()

    const snapshotMetadata = snapshotManager.getFullSnapshotMetadata()

    // Assert snapshot was created
    expect(snapshotMetadata!.entities.wearable.lastIncludedDeploymentTimestamp).toBe(0)
  })

  it(`When snapshot manager starts, if there were no entities deployed, then the generated snapshot is empty`, async () => {
    const { snapshotManager } = components

    // Assert there is no snapshot
    expect(snapshotManager.getFullSnapshotMetadata()).toBeUndefined()

    // force snapshot generation
    await snapshotManager.generateSnapshots()

    // Assert snapshot was created
    const snapshotMetadata = snapshotManager.getFullSnapshotMetadata()
    expect(snapshotMetadata).toBeDefined()
    expect(snapshotMetadata!.lastIncludedDeploymentTimestamp).toBe(0)

    // Assert snapshot content is empty
    await assertGZipSnapshotContains(snapshotMetadata)
  })

  async function assertGZipSnapshotContains(
    snapshotMetadata: SnapshotMetadata | undefined,
    ...entitiesCombo: EntityCombo[]
  ) {
    const { hash } = snapshotMetadata!
    const content: ContentItem = (await components.storage.retrieve(hash))!

    const entityToPointersSnapshot: Map<string, string[]> = new Map()

    const readStream = await content.asStream()

    for await (const deployment of processDeploymentsInStream(readStream)) {
      entityToPointersSnapshot.set(deployment.entityId, (deployment as any).pointers)
    }

    try {
      expect(entityToPointersSnapshot.size).toBe(entitiesCombo.length)

      for (const { entity } of entitiesCombo) {
        expect(entityToPointersSnapshot.get(entity.id)).toEqual(entity.pointers)
      }
    } catch (e) {
      process.stderr.write(inspect({ hash, content, snapshot: entityToPointersSnapshot }) + '\n')
      throw e
    }
  }
})
