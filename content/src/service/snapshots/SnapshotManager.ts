import { checkFileExists, tmpFile as createTempFile } from '@dcl/snapshots-fetcher/dist/utils'
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

  getSnapshotsFrequencyInMilliseconds(): number {
    return this.snapshotFrequencyInMilliSeconds
  }

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

  async calculateFullSnapshots(): Promise<void> {
    // TODO: Add metrics regarding snapshots
    const currentTimestamp: number = Date.now()
    return this.repository.txIf(
      async (transaction) => {
        this.lastSnapshotsForAllEntityTypes = await this.systemPropertiesManager.getSystemProperty(
          SystemProperty.LAST_FULL_SNAPSHOTS,
          transaction
        )

        if (
          !this.lastSnapshotsForAllEntityTypes ||
          currentTimestamp - this.lastSnapshotsForAllEntityTypes.lastIncludedDeploymentTimestamp >
            this.snapshotFrequencyInMilliSeconds
        ) {
          await this.generateSnapshot(transaction)
        }
      },
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
  }

  getSnapshotMetadataPerEntityType(entityType: EntityType): SnapshotMetadata | undefined {
    return this.lastSnapshots.get(entityType)
  }

  getSnapshotMetadataForAllEntityType(): SnapshotMetadata | undefined {
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

  /** This methods queries the database and builds the snapshots, stores it on the content storage, and saves the metadata */
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
    const previousFullSnapshot = this.lastSnapshotsForAllEntityTypes

    await this.repository.reuseIfPresent(
      task,
      (db) =>
        db.txIf(async (transaction) => {
          // Get all the active entities
          const snapshot: FullSnapshot[] = await transaction.deployments.getFullSnapshot()

          // Calculate the local deployment timestamp of the newest entity in the snapshot
          const snapshotTimestamp = snapshot[0]?.localTimestamp ?? 0

          // Format the snapshot in a buffer
          // fs.mkdirSync(path.resolve(this.contentStorageFolder, 'tmp-snapshot'), { recursive: true })
          const tmpFile = await createTempFile('snapshot')
          // path.resolve(this.contentStorageFolder, 'tmp-snapshot/' + Math.random())
          console.log(`Name of file: ${tmpFile}`)
          const writeStream = fs.createWriteStream(tmpFile)
          const fileClosedFuture = new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
          })
          console.log(`File written`)
          try {
            for (const snapshotElem of snapshot) {
              writeStream.write(JSON.stringify(snapshotElem) + '\n')
            }
          } finally {
            writeStream.close()
            await fileClosedFuture
            // writeStream.end()
          }
          console.log(`Stream closed`)

          const contentFromFile = await fs.promises.readFile(tmpFile)
          console.log(`Could read file`)
          // TODO: use require('@dcl/snapshots-fetcher/dist/utils').hashStreamV1 after
          //       https://github.com/decentraland/snapshots-fetcher/pull/4/files is merged
          const hash = await Hashing.calculateIPFSHash(contentFromFile)

          console.log(`Hash of the file: ${hash}`)
          // set the correct name
          const destinationFilename = path.resolve(this.contentStorageFolder, 'contents/', hash)
          console.log(`Moving to: ${destinationFilename}`)

          // delete target file if exists
          if (await checkFileExists(destinationFilename)) {
            await fs.promises.unlink(destinationFilename)
          }

          console.log(`Renaming file from: ${tmpFile} to: ${destinationFilename}`)
          // move downloaded file to target folder
          await fs.promises.rename(tmpFile, destinationFilename)

          // Store the metadata
          this.lastSnapshotsForAllEntityTypes = { hash, lastIncludedDeploymentTimestamp: snapshotTimestamp }
          await this.systemPropertiesManager.setSystemProperty(
            SystemProperty.LAST_FULL_SNAPSHOTS,
            this.lastSnapshotsForAllEntityTypes,
            db
          )

          // Log
          SnapshotManager.LOGGER.debug(
            `Generated snapshot for all entity types. It includes ${snapshot.length} active deployments. Last timestamp is ${snapshotTimestamp}`
          )
        }),
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )

    // Delete the previous full snapshot (if it exists)
    if (previousFullSnapshot) {
      await this.service.deleteContent([previousFullSnapshot.hash])
    }
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
