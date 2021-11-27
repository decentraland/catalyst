import { delay } from '@catalyst/commons'
import { checkFileExists, hashStreamV1 } from '@dcl/snapshots-fetcher/dist/utils'
import { ContentFileHash, EntityType, Hashing, Timestamp } from 'dcl-catalyst-commons'
import * as fs from 'fs'
import log4js from 'log4js'
import * as path from 'path'
import { FullSnapshot } from 'src/repository/extensions/DeploymentsRepository'
import { Database } from '../../repository/Database'
import { Repository } from '../../repository/Repository'
import { DB_REQUEST_PRIORITY } from '../../repository/RepositoryQueue'
import { SystemPropertiesManager, SystemProperty } from '../../service/system-properties/SystemProperties'
import { Entity } from '../Entity'
import { MetaverseContentService } from '../Service'

export class SnapshotManager {
  private static readonly LOGGER = log4js.getLogger('SnapshotManager')
  private readonly counter: Map<EntityType, number> = new Map()
  private lastSnapshots: Map<EntityType, SnapshotMetadata> = new Map()
  private lastSnapshotsForAllEntityTypes: SnapshotMetadata | undefined = undefined
  private running = true

  constructor(
    private readonly systemPropertiesManager: SystemPropertiesManager,
    private readonly repository: Repository,
    private readonly service: MetaverseContentService,
    private readonly snapshotFrequency: Map<EntityType, number>,
    private readonly snapshotFrequencyInMilliSeconds: number,
    private readonly contentStorageFolder: string
  ) {
    service.listenToDeployments((deployment) => this.onDeployment(deployment))
  }

  /**
   * @deprecated
   */
  startSnapshotsPerEntity(): Promise<void> {
    return this.repository.txIf(
      async (transaction) => {
        this.lastSnapshots = new Map(
          await this.systemPropertiesManager.getSystemProperty(
            SystemProperty.LAST_FULL_SNAPSHOTS_PER_ENTITY,
            transaction
          )
        )
        for (const entityType of Object.values(EntityType)) {
          const snapshot = this.lastSnapshots.get(entityType)
          const typeFrequency = this.getFrequencyForType(entityType)
          if (
            !snapshot ||
            (await this.deploymentsSince(entityType, snapshot.lastIncludedDeploymentTimestamp, transaction)) >=
              typeFrequency
          ) {
            await this.generateSnapshotPerEntityType(entityType, transaction)
          }
        }
      },
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
  }

  async startCalculateFullSnapshots(): Promise<void> {
    // TODO: Add metrics regarding snapshots
    await this.generateSnapshot()
    this.snapshotGenerationJob().catch(console.error)
  }

  async snapshotGenerationJob() {
    while (this.running) {
      await delay(this.snapshotFrequencyInMilliSeconds)

      try {
        await this.generateSnapshot()
      } catch (e: any) {
        SnapshotManager.LOGGER.error(e)
      }
    }
  }

  stopCalculateFullSnapshots(): void {
    this.running = false
  }

  getSnapshotMetadataPerEntityType(entityType: EntityType): SnapshotMetadata | undefined {
    return this.lastSnapshots.get(entityType)
  }

  getFullSnapshotMetadata(): SnapshotMetadata | undefined {
    return this.lastSnapshotsForAllEntityTypes
  }

  private async onDeployment({ entity }: { entity: Entity }): Promise<void> {
    const { type } = entity
    // Update the counter
    const updatedCounter = (this.counter.get(type) ?? 0) + 1
    this.counter.set(type, updatedCounter)

    // If the number of deployments reaches the frequency, then generate a snapshot
    if (updatedCounter >= this.getFrequencyForType(type)) {
      await this.generateSnapshotPerEntityType(type)
    }
  }

  /**
   * This methods queries the database and builds the snapshots, stores it on the content storage, and saves the metadata
   * @deprecated
   */
  private async generateSnapshotPerEntityType(entityType: EntityType, task?: Database): Promise<void> {
    const previousSnapshot = this.lastSnapshots.get(entityType)

    await this.repository.reuseIfPresent(
      task,
      (db) =>
        db.txIf(async (transaction) => {
          // Get the active entities
          const snapshot = await transaction.deployments.getSnapshotPerEntityType(entityType)

          // Calculate the local deployment timestamp of the newest entity in the snapshot
          const snapshotTimestamp = snapshot[0]?.localTimestamp ?? 0

          // Format the snapshot in a buffer
          const inArrayFormat = snapshot.map(({ entityId, pointers }) => [entityId, pointers])
          const buffer = Buffer.from(JSON.stringify(inArrayFormat))

          // Calculate the snapshot's hash
          const hash = await Hashing.calculateIPFSHash(buffer)

          // Store the new snapshot
          await this.service.storeContent(hash, buffer)

          // Store the metadata
          await this.storeSnapshotMetadata(entityType, hash, snapshotTimestamp, db)

          // Reset the counter
          this.counter.set(entityType, 0)

          // Log
          SnapshotManager.LOGGER.debug(
            `Generated snapshot for type: '${entityType}'. It includes ${snapshot.length} active deployments. Last timestamp is ${snapshotTimestamp}`
          )
        }),
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )

    // Delete the previous snapshot (if it exists)
    if (previousSnapshot) {
      await this.service.deleteContent([previousSnapshot.hash])
    }
  }

  /** This methods queries the database and builds the snapshots, stores it on the content storage, and saves the metadata */
  private async generateSnapshot(task?: Database): Promise<void> {
    // Format the snapshot in a tmp file
    const tmpFile = path.resolve(this.contentStorageFolder, 'tmp-snapshot-file')

    try {
      if (await checkFileExists(tmpFile)) {
        await fs.promises.unlink(tmpFile)
      }

      const previousHash = this.lastSnapshotsForAllEntityTypes?.hash

      const snapshot: FullSnapshot[] = await this.repository.reuseIfPresent(
        task,
        async (db) => {
          // Get all the active entities
          return db.deployments.getFullSnapshot()
        },
        { priority: DB_REQUEST_PRIORITY.HIGH }
      )

      // Calculate the local deployment timestamp of the newest entity in the snapshot
      const snapshotTimestamp = snapshot[snapshot.length - 1]?.localTimestamp ?? 0

      const writeStream = fs.createWriteStream(tmpFile)
      const fileClosedFuture = new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })

      try {
        for (const snapshotElem of snapshot) {
          writeStream.write(JSON.stringify(snapshotElem) + '\n')
        }
      } finally {
        writeStream.close()
        await fileClosedFuture
      }

      const hash = await hashStreamV1(fs.createReadStream(tmpFile) as any)

      // if success move the file to the contents folder
      const destinationFilename = path.resolve(this.contentStorageFolder, 'contents/', hash)

      if (!(await checkFileExists(destinationFilename))) {
        // move downloaded file to target folder
        await fs.promises.rename(tmpFile, destinationFilename)
      }

      // Store the metadata
      this.lastSnapshotsForAllEntityTypes = { hash, lastIncludedDeploymentTimestamp: snapshotTimestamp }

      // Log
      SnapshotManager.LOGGER.debug(
        `Generated snapshot for all entity types. It includes ${snapshot.length} active deployments. Last timestamp is ${snapshotTimestamp}`
      )

      // Delete the previous full snapshot (if it exists)
      if (!!previousHash && this.shouldPrunePreviousSnapshot(previousHash)) {
        await this.service.deleteContent([previousHash])
      }
    } catch (err: any) {
      SnapshotManager.LOGGER.debug('There was an error generating snapshot')
      SnapshotManager.LOGGER.error(err)
    } finally {
      // always delete the staging file
      await fs.promises.unlink(tmpFile)
    }
  }

  private shouldPrunePreviousSnapshot(previousHash: string): boolean {
    return this.lastSnapshotsForAllEntityTypes?.hash !== previousHash
  }

  private deploymentsSince(entityType: EntityType, timestamp: Timestamp, db: Database): Promise<number> {
    return db.deployments.deploymentsSince(entityType, timestamp)
  }

  private storeSnapshotMetadata(
    entityType: EntityType,
    hash: ContentFileHash,
    lastIncludedDeploymentTimestamp: Timestamp,
    db: Database
  ) {
    this.lastSnapshots.set(entityType, { hash, lastIncludedDeploymentTimestamp })
    return this.systemPropertiesManager.setSystemProperty(
      SystemProperty.LAST_FULL_SNAPSHOTS_PER_ENTITY,
      Array.from(this.lastSnapshots.entries()),
      db
    )
  }

  private getFrequencyForType(entityType: EntityType): number {
    return this.snapshotFrequency.get(entityType) ?? 100
  }
}

export type SnapshotMetadata = { hash: ContentFileHash; lastIncludedDeploymentTimestamp: Timestamp }
