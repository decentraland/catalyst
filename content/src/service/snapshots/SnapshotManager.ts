import { delay } from '@catalyst/commons'
import { hashStreamV1 } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { ContentFileHash, EntityType, Hashing, Timestamp } from 'dcl-catalyst-commons'
import * as fs from 'fs'
import * as path from 'path'
import { streamActiveDeployments } from '../../logic/snapshots-queries'
import { createContentFileWriterComponent } from '../../ports/contentFileWriter'
import { compressContentFile } from '../../storage/compression'
import { AppComponents } from '../../types'
import { MetaverseContentService } from '../Service'

const ALL_ENTITIES = Symbol('allEntities')
type ALL_ENTITIES = typeof ALL_ENTITIES

export class SnapshotManager {
  /** @deprecated */
  private lastSnapshots: Map<EntityType, SnapshotMetadata> = new Map()
  private lastSnapshotsPerEntityType: Map<EntityType | ALL_ENTITIES, SnapshotMetadata> = new Map()

  private LOGGER: ILoggerComponent.ILogger

  private running = false
  private generatedSnapshots = 0

  constructor(
    private readonly components: Pick<AppComponents, 'database' | 'metrics' | 'staticConfigs' | 'logs'>,
    private readonly service: MetaverseContentService,
    private readonly snapshotFrequencyInMilliSeconds: number
  ) {
    this.LOGGER = components.logs.getLogger('SnapshotManager')
  }

  async startCalculateFullSnapshots(): Promise<void> {
    // start async job
    this.snapshotGenerationJob().catch(console.error)

    // wait up to 60 seconds for job to finish
    let counter = 60
    while (this.generatedSnapshots == 0 && this.running) {
      await delay(1000)
      counter--
      if (counter == 0) {
        throw new Error('Could not generate a full snapshot in less than 60 seconds')
      }
    }
  }

  async snapshotGenerationJob() {
    if (this.running) return
    this.running = true
    while (this.running) {
      try {
        await this.generateSnapshots()
        this.LOGGER.info('Generated full snapshot')
      } catch (e: any) {
        this.LOGGER.error(e)
      }

      await delay(this.snapshotFrequencyInMilliSeconds)
    }
    this.running = false
  }

  stopCalculateFullSnapshots(): void {
    this.running = false
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
  private async generateSnapshots(): Promise<void> {
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

    // Phase 2) iterate all active deployments and write to files
    try {
      for await (const snapshotElem of streamActiveDeployments(this.components)) {
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
      }
    } finally {
      await fileWriterComponent.flushToDiskAndCloseFiles()
    }

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

    this.generatedSnapshots++
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
