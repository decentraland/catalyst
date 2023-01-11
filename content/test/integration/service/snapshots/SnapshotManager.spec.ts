import { EntityType } from '@dcl/schemas'
import { processDeploymentsInStream } from '@dcl/snapshots-fetcher/dist/file-processor'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { setupTestEnvironment } from '../../E2ETestEnvironment'
import { inspect } from 'util'
import { EnvironmentBuilder } from '../../../../src/Environment'
import { stopAllComponents } from '../../../../src/logic/components-lifecycle'
import { ContentItem } from '../../../../src/ports/contentStorage/contentStorage'
import { isSuccessfulDeployment } from '../../../../src/service/Service'
import { SnapshotMetadata } from '../../../../src/service/snapshots/SnapshotManager'
import { AppComponents } from '../../../../src/types'
import { makeNoopServerValidator, makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { buildDeployData, buildDeployDataAfterEntity, deployEntitiesCombo, EntityCombo } from '../../E2ETestUtils'

describe('Integration - Snapshot Manager', () => {
  const getTestEnv = setupTestEnvironment()

  const P1 = 'X1,Y1',
    P2 = 'X2,Y2'
  let E1: EntityCombo, E2: EntityCombo

  let components: AppComponents
  let logs: ILoggerComponent
  let logger: ILoggerComponent.ILogger

  beforeAll(async () => {
    E1 = await buildDeployData([P1], { type: EntityType.SCENE, metadata: {} })
    E2 = await buildDeployDataAfterEntity(E1, [P2], { type: EntityType.SCENE, metadata: {} })
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
    logger = logs.getLogger('snapshot-manager-test')
  })

  beforeEach(async () => {
    const baseEnv = await getTestEnv().getEnvForNewDatabase()
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
    expect(isSuccessfulDeployment(deploymentResult)).toBeTruthy()
    expect(snapshotMetadata!.lastIncludedDeploymentTimestamp).toEqual(deploymentResult)
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
    expect(isSuccessfulDeployment(deploymentResult)).toBeTruthy()
    // expect(snapshotMetadata!.entities.scene.lastIncludedDeploymentTimestamp).toEqual(Math.max(E1.entity.timestamp, E2.entity.timestamp))
    expect(snapshotMetadata!.entities.scene.lastIncludedDeploymentTimestamp).toEqual(deploymentResult)
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

    for await (const deployment of processDeploymentsInStream(readStream, logger)) {
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
