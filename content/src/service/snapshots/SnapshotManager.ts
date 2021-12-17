import { delay } from '@catalyst/commons'
import { hashStreamV1 } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { ContentFileHash, EntityType, Hashing, Timestamp } from 'dcl-catalyst-commons'
import future from 'fp-future'
import * as fs from 'fs'
import * as path from 'path'
import { StatusCapableComponent } from 'src/ports/status'
import { streamActiveDeployments } from '../../logic/snapshots-queries'
import { createContentFileWriterComponent } from '../../ports/contentFileWriter'
import { compressContentFile } from '../../storage/compression'
import { AppComponents } from '../../types'
import { MetaverseContentService } from '../Service'

const ALL_ENTITIES = Symbol('allEntities')
type ALL_ENTITIES = typeof ALL_ENTITIES

export class SnapshotManager implements StatusCapableComponent {
  /** @deprecated */
  private lastSnapshots: Map<EntityType, SnapshotMetadata> = new Map()
  private lastSnapshotsPerEntityType: Map<EntityType | ALL_ENTITIES, SnapshotMetadata> = new Map()
  private LOGGER: ILoggerComponent.ILogger
  private activeEntities: Partial<Record<EntityType, number>>
  private lastUpdatedTime: number
  private readonly STATUS_NAME = 'snapshot'

  constructor(
    private readonly components: Pick<AppComponents, 'database' | 'metrics' | 'staticConfigs' | 'logs'>,
    private readonly service: MetaverseContentService,
    private readonly snapshotFrequencyInMilliSeconds: number
  ) {
    this.LOGGER = components.logs.getLogger('SnapshotManager')
  }

  getStatusName() {
    return this.STATUS_NAME
  }

  async getComponentStatus() {
    return {
      entities: this.activeEntities,
      lastUpdatedTime: this.lastUpdatedTime
    }
  }

  async startCalculateFullSnapshots(): Promise<{ stop: () => Promise<boolean> }> {
    // generate a first snapshot
    await this.generateSnapshots()

    // async job to generate snapshots
    const stopPromise = future<void>()

    const stopped = new Promise<boolean>(async (resolve) => {
      while (stopPromise.isPending) {
        // use race to not wait for the delay to stop when stopping the job
        await Promise.race([delay(this.snapshotFrequencyInMilliSeconds), stopPromise])

        // actually do the generation
        try {
          await this.generateSnapshots()
        } catch (e: any) {
          this.LOGGER.error(e)
        }
      }

      // signal that stop finished correctly
      resolve(true)
    })

    return {
      stop: () => {
        this.LOGGER.info('Stopping snapshot generation job')
        stopPromise.resolve()
        return stopped
      }
    }
  }

  /**
   * @deprecated
   */
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

  /**
   * @deprecated
   * This methods queries the database and builds the snapshots, stores it on the content storage, and saves the metadata
   */
  private async generateLegacySnapshotPerEntityType(
    entityType: EntityType,
    inArrayFormat: Array<[string, string[]]>
  ): Promise<void> {
    const previousSnapshot = this.lastSnapshots.get(entityType)

    // Get the active entities
    const snapshotTimestamp = 0

    // Format the snapshot in a buffer
    const buffer = Buffer.from(JSON.stringify(inArrayFormat))

    // Calculate the snapshot's hash
    const hash = await Hashing.calculateIPFSHash(buffer)

    // Store the new snapshot
    await this.service.storeContent(hash, buffer)

    // Store the metadata
    this.lastSnapshots.set(entityType, { hash, lastIncludedDeploymentTimestamp: snapshotTimestamp })
    // Log
    this.LOGGER.debug(
      `Generated legacy snapshot for type: '${entityType}'. It includes ${inArrayFormat.length} active deployments. Last timestamp is ${snapshotTimestamp}`
    )

    // Delete the previous snapshot (if it exists)
    if (previousSnapshot) {
      await this.service.deleteContent([previousSnapshot.hash])
    }
  }
  /** This methods queries the database and builds the snapshots, stores it on the content storage, and saves the metadata */
  async generateSnapshots(): Promise<void> {
    const { end: stopTimer } = this.components.metrics.startTimer('dcl_content_snapshot_generation_time', {
      entity_type: ALL_ENTITIES.toString()
    })

    const fileWriterComponent = createContentFileWriterComponent<EntityType | ALL_ENTITIES>(this.components)

    // this header is necessary to later differentiate between binary formats and non-binary formats
    const FILE_HEADER = '### Decentraland json snapshot\n'

    // Phase 1) pre-open all the files and write the headers
    await fileWriterComponent.appendToFile(ALL_ENTITIES, FILE_HEADER)
    for (const entityType of Object.keys(EntityType)) {
      await fileWriterComponent.appendToFile(EntityType[entityType], FILE_HEADER)
    }

    const timestamps: Record<string | symbol, number> = {}
    function increaseTimestamp(type: symbol | string, timestamp: number) {
      timestamps[type] = timestamps[type] || 0
      if (timestamps[type] < timestamp) timestamps[type] = timestamp
    }

    const inMemoryArrays: Partial<Record<EntityType, Array<[string, string[]]>>> = {}
    function appendToInMemoryArray(type: EntityType, tuple: [string, string[]]) {
      const array = (inMemoryArrays[type] = inMemoryArrays[type] || [])
      array.push(tuple)
    }

    const newActiveEntitiesCount = {}

    // Phase 2) iterate all active deployments and write to files
    try {
      for await (const snapshotElem of streamActiveDeployments(this.components)) {
        // TODO: [new-sync] filter out denylisted entities

        const str = JSON.stringify(snapshotElem) + '\n'

        // update ALL_ENTITIES timestamp
        increaseTimestamp(ALL_ENTITIES, snapshotElem.localTimestamp)

        // write deployment to ALL_ENTITIES file
        await fileWriterComponent.appendToFile(ALL_ENTITIES, str)

        // update entityType timestamp
        increaseTimestamp(snapshotElem.entityType, snapshotElem.localTimestamp)

        // write deployment to entityType file
        await fileWriterComponent.appendToFile(snapshotElem.entityType as EntityType, str)

        // add the entoty to the inMemoryArray to be used by the legacy formatter
        appendToInMemoryArray(snapshotElem.entityType as EntityType, [snapshotElem.entityId, snapshotElem.pointers])

        if (newActiveEntitiesCount[snapshotElem.entityType] != null) {
          newActiveEntitiesCount[snapshotElem.entityType]++
        } else {
          newActiveEntitiesCount[snapshotElem.entityType] = 1
        }
      }
    } finally {
      await fileWriterComponent.flushToDiskAndCloseFiles()
    }

    this.activeEntities = newActiveEntitiesCount
    this.lastUpdatedTime = Date.now()

    // Phase 3) hash generated files and move them to content folder
    try {
      // compress and commit
      for (const [entityType, { fileName }] of fileWriterComponent.allFiles) {
        const previousHash = this.lastSnapshotsPerEntityType.get(entityType)?.hash

        // Hash the snapshot
        const hash = await hashStreamV1(fs.createReadStream(fileName) as any)

        // if success move the file to the contents folder
        await this.moveSnapshotFileToContentFolder(fileName, { hash, snapshotTimestamp: timestamps[entityType] || 0 })

        // Save the snapshot hash and metadata
        const newSnapshot = { hash, lastIncludedDeploymentTimestamp: timestamps[entityType] || 0 }
        this.lastSnapshotsPerEntityType.set(entityType, newSnapshot)

        // Delete the previous full snapshot (if it exists and is different than the brand new file)
        if (previousHash && previousHash != hash) {
          this.removePreviousSnapshotFile(previousHash)
        }

        // dump legacy format
        if (entityType !== ALL_ENTITIES && inMemoryArrays[entityType]) {
          try {
            await this.generateLegacySnapshotPerEntityType(entityType, inMemoryArrays[entityType]!)
          } catch (e: any) {
            this.LOGGER.error(e)
          }
        }
      }
    } catch (err: any) {
      stopTimer({ failed: 'true' })
      this.LOGGER.error(err)
    } finally {
      stopTimer({ failed: 'false' })
    }

    await fileWriterComponent.deleteAllFiles()
  }

  private removePreviousSnapshotFile(previousHash: string) {
    // the deletion of the files is deferred two minutes because there may be peers
    // still using the content files
    setTimeout(() => {
      this.service.deleteContent([previousHash]).catch(this.LOGGER.error)
    }, 2 * 60000)
  }

  private async moveSnapshotFileToContentFolder(
    tmpFile: string,
    options: {
      hash: string
      snapshotTimestamp: number
    }
  ) {
    const destinationFilename = path.resolve(this.components.staticConfigs.contentStorageFolder, options.hash)

    const hasContent = await this.service.getContent(options.hash)

    if (!hasContent) {
      // move and compress the file into the destinationFilename
      await this.service.storeContent(options.hash, fs.createReadStream(tmpFile))
      this.LOGGER.info(
        `Generated snapshot. hash=${options.hash} lastIncludedDeploymentTimestamp=${options.snapshotTimestamp}`
      )
      await compressContentFile(destinationFilename)
    } else {
      this.LOGGER.debug(
        `Snapshot didn't change. hash=${options.hash} lastIncludedDeploymentTimestamp=${options.snapshotTimestamp}`
      )
    }
  }
}

export type SnapshotMetadata = { hash: ContentFileHash; lastIncludedDeploymentTimestamp: Timestamp }
export type FullSnapshotMetadata = SnapshotMetadata & { entities: Record<string, SnapshotMetadata> }
