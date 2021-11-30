import { delay } from '@catalyst/commons'
import { checkFileExists, hashStreamV1 } from '@dcl/snapshots-fetcher/dist/utils'
import { ContentFileHash, EntityType, Hashing, Timestamp } from 'dcl-catalyst-commons'
import * as fs from 'fs'
import log4js from 'log4js'
import * as path from 'path'
import {
  DeploymentWithAuthChain,
  streamActiveDeployments,
  streamActiveDeploymentsEntityType
} from '../../logic/snapshots-queries'
import { Database } from '../../repository/Database'
import { Repository } from '../../repository/Repository'
import { DB_REQUEST_PRIORITY } from '../../repository/RepositoryQueue'
import { SystemPropertiesManager, SystemProperty } from '../../service/system-properties/SystemProperties'
import { compressContentFile } from '../../storage/compression'
import { AppComponents } from '../../types'
import { Entity } from '../Entity'
import { MetaverseContentService } from '../Service'

const ALL_ENTITIES = Symbol('allEntities')
type ALL_ENTITIES = typeof ALL_ENTITIES

export class SnapshotManager {
  /** @deprecated */
  private readonly counter: Map<EntityType, number> = new Map()
  /** @deprecated */
  private lastSnapshots: Map<EntityType, SnapshotMetadata> = new Map()

  static readonly LOGGER = log4js.getLogger('SnapshotManager')

  private lastSnapshotsPerEntityType: Map<EntityType | ALL_ENTITIES, SnapshotMetadata> = new Map()

  private running = true

  constructor(
    private readonly components: Pick<AppComponents, 'database' | 'metrics' | 'staticConfigs'>,
    private readonly systemPropertiesManager: SystemPropertiesManager,
    private readonly repository: Repository,
    private readonly service: MetaverseContentService,
    private readonly snapshotFrequency: Map<EntityType, number>,
    private readonly snapshotFrequencyInMilliSeconds: number
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
    // start async job
    this.snapshotGenerationJob().catch(console.error)

    // wait up to 10 seconds for job to finish
    let counter = 60
    while (!this.lastSnapshotsPerEntityType.has(ALL_ENTITIES) && this.running) {
      await delay(1000)
      counter--
      if (counter == 0) {
        throw new Error('Could not generate a full snapshot in less than 60 seconds')
      }
    }
  }

  async snapshotGenerationJob() {
    while (this.running) {
      try {
        await this.generateSnapshot(ALL_ENTITIES)
        SnapshotManager.LOGGER.info('Generated full snapshot')
        for (const entityType in EntityType) {
          await this.generateSnapshot(EntityType[entityType])
          SnapshotManager.LOGGER.info(`Generated snapshot for ${entityType} entity.`)
        }
      } catch (e: any) {
        SnapshotManager.LOGGER.error(e)
      }

      await delay(this.snapshotFrequencyInMilliSeconds)
    }
  }

  stopCalculateFullSnapshots(): void {
    this.running = false
  }

  getSnapshotMetadataPerEntityType(entityType: EntityType): SnapshotMetadata | undefined {
    return this.lastSnapshots.get(entityType)
  }

  getFullSnapshotMetadata(): FullSnapshotMetadata | undefined {
    const fullMetadata = this.lastSnapshotsPerEntityType.get(ALL_ENTITIES)

    if (!fullMetadata) return

    // by default symbols are not printed out in JSON.stringify
    const entities = Object.fromEntries(this.lastSnapshotsPerEntityType)

    return {
      ...fullMetadata,
      entities
    }
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
   * @deprecated
   * This methods queries the database and builds the snapshots, stores it on the content storage, and saves the metadata
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
  private async generateSnapshot(entityType: EntityType | ALL_ENTITIES): Promise<void> {
    // Format the snapshot in a tmp file
    const tmpFile = path.resolve(this.components.staticConfigs.contentStorageFolder, 'tmp-snapshot-file')
    const { end: stopTimer } = this.components.metrics.startTimer('dcl_content_snapshot_generation_time')

    try {
      let previousHash: string | undefined = this.lastSnapshotsPerEntityType.get(entityType)?.hash

      const deploymentsIterable =
        entityType === ALL_ENTITIES
          ? streamActiveDeployments(this.components)
          : streamActiveDeploymentsEntityType(this.components, entityType)

      // Write to tmpFile the snapshot obtained
      const { snapshotTimestamp, elements, timeElapsed } = await this.writeToFile(tmpFile, deploymentsIterable)

      // Hash the snapshot
      const hash = await hashStreamV1(fs.createReadStream(tmpFile) as any)

      // if success move the file to the contents folder
      await this.moveSnapshotFileToContentFolder(tmpFile, { hash, snapshotTimestamp, elements, timeElapsed })

      // Save the snapshot hash and metadata
      const newSnapshot = { hash, lastIncludedDeploymentTimestamp: snapshotTimestamp }
      this.lastSnapshotsPerEntityType.set(entityType, newSnapshot)

      // Delete the previous full snapshot (if it exists)
      this.removePreviousSnapshotFile(previousHash)
    } catch (err: any) {
      stopTimer({ failed: 'true' })
      SnapshotManager.LOGGER.error(err)
    } finally {
      stopTimer({ failed: 'false' })
      await this.deleteStagingFile(tmpFile)
    }
  }

  private async deleteStagingFile(tmpFile: string) {
    if (await checkFileExists(tmpFile)) {
      try {
        await fs.promises.unlink(tmpFile)
      } catch (err) {
        SnapshotManager.LOGGER.error(err)
      }
    }
  }

  private removePreviousSnapshotFile(previousHash: string | undefined) {
    // the deletion of the files is deferred two minutes because there may be peers
    // still using the content files
    setTimeout(() => {
      if (previousHash && this.shouldPrunePreviousSnapshot(previousHash)) {
        this.service.deleteContent([previousHash]).catch(SnapshotManager.LOGGER.error)
      }
    }, 2 * 60000)
  }

  private async moveSnapshotFileToContentFolder(
    tmpFile: string,
    options: {
      hash: string
      snapshotTimestamp: number
      elements: number
      timeElapsed: number
    }
  ) {
    const destinationFilename = path.resolve(this.components.staticConfigs.contentStorageFolder, options.hash)

    const hasContent = await this.service.getContent(options.hash)

    if (!hasContent) {
      // move and compress the file into the destinationFilename
      await this.service.storeContent(options.hash, fs.createReadStream(tmpFile))
      SnapshotManager.LOGGER.info(
        `Generated snapshot. hash=${options.hash} lastIncludedDeploymentTimestamp=${options.snapshotTimestamp} elements=${options.elements} timeElapsed=${options.timeElapsed}`
      )
      await compressContentFile(destinationFilename)
    } else {
      SnapshotManager.LOGGER.debug(
        `Snapshot didn't change. hash=${options.hash} lastIncludedDeploymentTimestamp=${options.snapshotTimestamp} elements=${options.elements} timeElapsed=${options.timeElapsed}`
      )
    }
  }

  private async writeToFile(tmpFile: string, iterable: AsyncIterable<DeploymentWithAuthChain>) {
    // if the process failed while creating the snapshot last time the file may still exists
    // deleting the staging tmpFile just in case
    if (await checkFileExists(tmpFile)) {
      await fs.promises.unlink(tmpFile)
    }
    const start = Date.now()
    const writeStream = fs.createWriteStream(tmpFile)
    const fileClosedFuture = new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
    let snapshotTimestamp = 0
    let elements = 0
    try {
      // this header is necessary to later differentiate between binary formats and non-binary formats
      writeStream.write('### Decentraland json snapshot\n')
      for await (const snapshotElem of iterable) {
        elements++
        writeStream.write(JSON.stringify(snapshotElem) + '\n')
        if (snapshotElem.localTimestamp > snapshotTimestamp) {
          snapshotTimestamp = snapshotElem.localTimestamp
        }
      }
    } finally {
      writeStream.close()
      await fileClosedFuture
    }

    return {
      snapshotTimestamp,
      timeElapsed: Date.now() - start,
      elements
    }
  }

  private shouldPrunePreviousSnapshot(previousHash: string): boolean {
    const oldMetadata = this.lastSnapshotsPerEntityType.get(ALL_ENTITIES)
    return !!oldMetadata && oldMetadata.hash !== previousHash
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
export type FullSnapshotMetadata = SnapshotMetadata & { entities: Record<string, SnapshotMetadata> }
