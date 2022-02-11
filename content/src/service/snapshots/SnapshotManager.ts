import { delay } from '@catalyst/commons'
import { hashStreamV1 } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { ContentFileHash, EntityType, Hashing, Timestamp } from 'dcl-catalyst-commons'
import future from 'fp-future'
import * as fs from 'fs'
import { streamActiveDeployments } from '../../logic/database-queries/snapshots-queries'
import { createContentFileWriterComponent } from '../../ports/contentFileWriter'
import { bufferToStream } from '../../storage/ContentStorage'
import { AppComponents, IStatusCapableComponent } from '../../types'

const ALL_ENTITIES = Symbol('allEntities')
type ALL_ENTITIES = typeof ALL_ENTITIES
const NAME_FOR_STATUS_ENDPOINT = 'snapshot'

export type ISnapshotManager = {
  getSnapshotMetadataPerEntityType(entityType: EntityType): SnapshotMetadata | undefined
  getFullSnapshotMetadata(): FullSnapshotMetadata | undefined
  generateSnapshots(): Promise<void>
}

export class SnapshotManager implements IStatusCapableComponent, ISnapshotManager {
  /** @deprecated */
  private lastSnapshots: Map<EntityType, SnapshotMetadata> = new Map()
  private lastSnapshotsPerEntityType: Map<EntityType | ALL_ENTITIES, SnapshotMetadata> = new Map()
  private LOGGER: ILoggerComponent.ILogger
  private runningJobs: Set<() => Promise<any>> = new Set()

  private statusEndpointData: { entities: Partial<Record<EntityType, number>>; lastUpdatedTime: number } = {
    entities: {},
    lastUpdatedTime: 0
  }

  constructor(
    private readonly components: Pick<
      AppComponents,
      'database' | 'metrics' | 'staticConfigs' | 'logs' | 'storage' | 'denylist'
    >,
    private readonly snapshotFrequencyInMilliSeconds: number
  ) {
    this.LOGGER = components.logs.getLogger('SnapshotManager')
  }

  async getComponentStatus() {
    return {
      name: NAME_FOR_STATUS_ENDPOINT,
      data: this.statusEndpointData
    }
  }

  async start() {
    // generate a first snapshot
    await this.generateSnapshots()

    // start a job
    await this.startCalculateFullSnapshots()
  }

  async stop() {
    // end jobs
    for (const stopFunction of this.runningJobs) {
      await stopFunction()
    }
  }

  async startCalculateFullSnapshots(): Promise<{ stop: () => Promise<boolean> }> {
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
          if (!stopPromise.isPending && e.toString().includes('Cannot use a pool after calling end on the pool')) {
            // noop
          } else {
            this.LOGGER.error(e)
          }
        }
      }

      // signal that stop finished correctly
      resolve(true)
    })

    const stop = () => {
      this.runningJobs.delete(stop)
      this.LOGGER.info('Stopping snapshot generation job')
      stopPromise.resolve()
      return stopped
    }

    this.runningJobs.add(stop)

    return {
      stop
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
    inArrayFormat: Array<[string, string[]]>,
    lastIncludedDeploymentTimestamp: number
  ): Promise<void> {
    const previousSnapshot = this.lastSnapshots.get(entityType)

    // Format the snapshot in a buffer
    const buffer = Buffer.from(JSON.stringify(inArrayFormat))

    // Calculate the snapshot's hash
    const hash = await Hashing.calculateIPFSHash(buffer)

    // Store the new snapshot
    await this.components.storage.storeStream(hash, bufferToStream(buffer))

    // Store the metadata
    this.lastSnapshots.set(entityType, { hash, lastIncludedDeploymentTimestamp })
    // Log
    this.LOGGER.debug(
      `Generated legacy snapshot for type: '${entityType}'. It includes ${inArrayFormat.length} active deployments. Last timestamp is ${lastIncludedDeploymentTimestamp}`
    )

    // Delete the previous snapshot (if it exists)
    if (previousSnapshot) {
      await this.components.storage.delete([previousSnapshot.hash])
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
        if (this.components.denylist.isDenyListed(snapshotElem.entityId)) {
          continue
        }

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

        // add the entity to the inMemoryArray to be used by the legacy formatter
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

    // update the snapshot sizes
    this.statusEndpointData.lastUpdatedTime = Date.now()
    for (const key in inMemoryArrays) {
      this.statusEndpointData.entities[key] = inMemoryArrays[key]!.length
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
            await this.generateLegacySnapshotPerEntityType(
              entityType,
              inMemoryArrays[entityType]!,
              timestamps[entityType] || 0
            )
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
      this.components.storage.delete([previousHash]).catch(this.LOGGER.error)
    }, 2 * 60000)
  }

  private async moveSnapshotFileToContentFolder(
    tmpFile: string,
    options: {
      hash: string
      snapshotTimestamp: number
    }
  ) {
    const hasContent = await this.components.storage.retrieve(options.hash)

    if (!hasContent) {
      // move and compress the file into the destinationFilename
      await this.components.storage.storeStreamAndCompress(options.hash, fs.createReadStream(tmpFile))
      this.LOGGER.info(
        `Generated snapshot. hash=${options.hash} lastIncludedDeploymentTimestamp=${options.snapshotTimestamp}`
      )
    }
  }
}

export type SnapshotMetadata = { hash: ContentFileHash; lastIncludedDeploymentTimestamp: Timestamp }
export type FullSnapshotMetadata = SnapshotMetadata & { entities: Record<string, SnapshotMetadata> }
