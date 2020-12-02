import log4js from 'log4js'
import { ContentFileHash, Timestamp, EntityType, Hashing } from 'dcl-catalyst-commons'
import { Repository, RepositoryTask } from '@katalyst/content/storage/Repository'
import { SystemPropertiesManager, SystemProperty } from '@katalyst/content/service/system-properties/SystemProperties'
import { MetaverseContentService } from '../Service'
import { Entity } from '../Entity'

export class SnapshotManager {
  private static readonly LOGGER = log4js.getLogger('SnapshotManager')
  private readonly counter: Map<EntityType, number> = new Map()
  private lastSnapshots: Map<EntityType, SnapshotMetadata> = new Map()

  constructor(
    private readonly systemPropertiesManager: SystemPropertiesManager,
    private readonly repository: Repository,
    private readonly service: MetaverseContentService,
    private readonly snapshotFrequency: Map<EntityType, number>
  ) {
    service.listenToDeployments((deployment) => this.onDeployment(deployment))
  }

  start(): Promise<void> {
    return this.repository.txIf(async (transaction) => {
      this.lastSnapshots = new Map(
        await this.systemPropertiesManager.getSystemProperty(SystemProperty.LAST_SNAPSHOTS, transaction)
      )
      for (const entityType of Object.values(EntityType)) {
        const snapshot = this.lastSnapshots.get(entityType)
        const typeFrequency = this.getFrequencyForType(entityType)
        if (
          !snapshot ||
          (await this.deploymentsSince(entityType, snapshot.lastIncludedDeploymentTimestamp, transaction)) >=
            typeFrequency
        ) {
          await this.generateSnapshot(entityType, transaction)
        }
      }
    })
  }

  getSnapshotMetadata(entityType: EntityType): SnapshotMetadata | undefined {
    return this.lastSnapshots.get(entityType)
  }

  private async onDeployment({ entity }: { entity: Entity }): Promise<void> {
    const { type } = entity
    // Update the counter
    const updatedCounter = (this.counter.get(type) ?? 0) + 1
    this.counter.set(type, updatedCounter)

    // If the number of deployments reaches the frequency, then generate a snapshot
    if (updatedCounter >= this.getFrequencyForType(type)) {
      await this.generateSnapshot(type)
    }
  }

  /** This methods queries the database and builds the snapshots, stores it on the content storage, and saves the metadata */
  private async generateSnapshot(
    entityType: EntityType,
    repository: RepositoryTask | Repository = this.repository
  ): Promise<void> {
    const previousSnapshot = this.lastSnapshots.get(entityType)

    await repository.txIf(async (transaction) => {
      // Get the active entities
      const snapshot = await transaction.deployments.getSnapshot(entityType)

      // Calculate the local deployment timestamp of the newest entity in the snapshot
      const snapshotTimestamp = snapshot[0]?.localTimestamp ?? 0

      // Format the snapshot in a buffer
      const inArrayFormat = snapshot.map(({ entityId, pointers }) => [entityId, pointers])
      const buffer = Buffer.from(JSON.stringify(inArrayFormat))

      // Calculate the snapshot's hash
      const hash = await Hashing.calculateBufferHash(buffer)

      // Store the new snapshot
      await this.service.storeContent(hash, buffer)

      // Store the metadata
      await this.storeSnapshotMetadata(entityType, hash, snapshotTimestamp, repository)

      // Reset the counter
      this.counter.set(entityType, 0)

      // Log
      SnapshotManager.LOGGER.debug(
        `Generated snapshot for type: '${entityType}'. It includes ${snapshot.length} active deployments. Last timestamp is ${snapshotTimestamp}`
      )
    })

    // Delete the previous snapshot (if it exists)
    if (previousSnapshot) {
      await this.service.deleteContent([previousSnapshot.hash])
    }
  }

  private deploymentsSince(
    entityType: EntityType,
    timestamp: Timestamp,
    repository: RepositoryTask | Repository = this.repository
  ): Promise<number> {
    return repository.deployments.deploymentsSince(entityType, timestamp)
  }

  private storeSnapshotMetadata(
    entityType: EntityType,
    hash: ContentFileHash,
    lastIncludedDeploymentTimestamp: Timestamp,
    repository: RepositoryTask | Repository = this.repository
  ) {
    this.lastSnapshots.set(entityType, { hash, lastIncludedDeploymentTimestamp })
    return this.systemPropertiesManager.setSystemProperty(
      SystemProperty.LAST_SNAPSHOTS,
      Array.from(this.lastSnapshots.entries()),
      repository
    )
  }

  private getFrequencyForType(entityType: EntityType): number {
    return this.snapshotFrequency.get(entityType) ?? 100
  }
}

export type SnapshotMetadata = { hash: ContentFileHash; lastIncludedDeploymentTimestamp: Timestamp }
