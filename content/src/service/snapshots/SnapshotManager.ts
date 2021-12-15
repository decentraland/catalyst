import { delay } from '@catalyst/commons'
import { checkFileExists, hashStreamV1 } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { ContentFileHash, EntityType, Hashing, Timestamp } from 'dcl-catalyst-commons'
import * as fs from 'fs'
import * as path from 'path'
import { streamActiveDeployments } from '../../logic/snapshots-queries'
import { compressContentFile } from '../../storage/compression'
import { AppComponents } from '../../types'
import { MetaverseContentService } from '../Service'

const ALL_ENTITIES = Symbol('allEntities')
type ALL_ENTITIES = typeof ALL_ENTITIES

export class SnapshotManager {
  /** @deprecated */
  private lastSnapshots: Map<EntityType, SnapshotMetadata> = new Map()
  private running = true

  private lastSnapshotsPerEntityType: Map<EntityType | ALL_ENTITIES, SnapshotMetadata> = new Map()

  private LOGGER: ILoggerComponent.ILogger

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
        await this.generateSnapshots()
        this.LOGGER.info('Generated full snapshot')
      } catch (e: any) {
        this.LOGGER.error(e)
      }

      await delay(this.snapshotFrequencyInMilliSeconds)
    }
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
      `Generated snapshot for type: '${entityType}'. It includes ${inArrayFormat.length} active deployments. Last timestamp is ${snapshotTimestamp}`
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

    let snapshotTimestamp = 0

    const fileWriterComponent = createFileWriterComponent()

    // Phase 1) iterate all active deployments and write to files
    try {
      for await (const snapshotElem of streamActiveDeployments(this.components)) {
        const str = JSON.stringify(snapshotElem) + '\n'

        await fileWriterComponent.writeToFile(ALL_ENTITIES, str)
        const { inMemoryArray } = await fileWriterComponent.writeToFile(snapshotElem.entityType as EntityType, str)
        // legacy format
        inMemoryArray.unshift([snapshotElem.entityId, snapshotElem.pointers])

        if (snapshotElem.localTimestamp > snapshotTimestamp) {
          snapshotTimestamp = snapshotElem.localTimestamp
        }
      }
    } finally {
      await fileWriterComponent.closeAllOpenFiles()
    }

    this.LOGGER.debug('Phase 1 complete for: ' + Array.from(fileWriterComponent.allFiles.keys()).join(','))

    // Phase 2) hash generated files and move them to content folder
    try {
      // compress and commit
      for (const [entityType, { fileName, inMemoryArray }] of fileWriterComponent.allFiles) {
        this.LOGGER.debug('Phase 2) starting ' + entityType.toString())
        // legacy format
        try {
          if (entityType !== ALL_ENTITIES) {
            await this.generateLegacySnapshotPerEntityType(entityType, inMemoryArray)
          }
        } catch (e: any) {
          this.LOGGER.error(e)
        }

        const previousHash = this.lastSnapshotsPerEntityType.get(entityType)?.hash

        // Hash the snapshot
        const hash = await hashStreamV1(fs.createReadStream(fileName) as any)

        // if success move the file to the contents folder
        await this.moveSnapshotFileToContentFolder(fileName, { hash, snapshotTimestamp })

        // Save the snapshot hash and metadata
        const newSnapshot = { hash, lastIncludedDeploymentTimestamp: snapshotTimestamp }
        this.lastSnapshotsPerEntityType.set(entityType, newSnapshot)

        // Delete the previous full snapshot (if it exists)
        this.removePreviousSnapshotFile(previousHash)
      }
    } catch (err: any) {
      stopTimer({ failed: 'true' })
      this.LOGGER.error(err)
    } finally {
      stopTimer({ failed: 'false' })
      for (const [_, { fileName }] of fileWriterComponent.allFiles) {
        await this.deleteStagingFile(fileName)
      }
    }
  }

  private async deleteStagingFile(tmpFile: string) {
    if (await checkFileExists(tmpFile)) {
      try {
        await fs.promises.unlink(tmpFile)
      } catch (err) {
        this.LOGGER.error(err)
      }
    }
  }

  private removePreviousSnapshotFile(previousHash: string | undefined) {
    // the deletion of the files is deferred two minutes because there may be peers
    // still using the content files
    setTimeout(() => {
      if (previousHash && this.shouldPrunePreviousSnapshot(previousHash)) {
        this.service.deleteContent([previousHash]).catch(this.LOGGER.error)
      }
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

  private shouldPrunePreviousSnapshot(previousHash: string): boolean {
    const oldMetadata = this.lastSnapshotsPerEntityType.get(ALL_ENTITIES)
    return !!oldMetadata && oldMetadata.hash !== previousHash
  }
}

export type SnapshotMetadata = { hash: ContentFileHash; lastIncludedDeploymentTimestamp: Timestamp }
export type FullSnapshotMetadata = SnapshotMetadata & { entities: Record<string, SnapshotMetadata> }

// this component opens file descriptors and enables us to write to them and close all the FD at once
function createFileWriterComponent() {
  const allFiles: Map<
    EntityType | ALL_ENTITIES,
    {
      file: fs.WriteStream
      close: () => Promise<void>
      fileName: string
      inMemoryArray: Array<[string, string[]]>
    }
  > = new Map()

  function fileNameFromType(type: EntityType | ALL_ENTITIES): string {
    return path.resolve(
      this.components.staticConfigs.contentStorageFolder,
      `tmp-snapshot-file-${typeof type == 'symbol' ? 'all' : type}`
    )
  }

  async function closeAllOpenFiles() {
    for (const [_, { close }] of allFiles) {
      await close()
    }
  }

  async function getFile(type: EntityType | ALL_ENTITIES) {
    if (allFiles.has(type)) return allFiles.get(type)!

    const fileName = fileNameFromType(type)

    // if the process failed while creating the snapshot last time the file may still exists
    // deleting the staging tmpFile just in case
    if (await checkFileExists(fileName)) {
      await fs.promises.unlink(fileName)
    }

    const file = fs.createWriteStream(fileName)

    const fileClosedFuture = new Promise<void>((resolve, reject) => {
      file.on('finish', resolve)
      file.on('error', reject)
    })

    const ret = {
      file,
      async close() {
        file.close()
        await fileClosedFuture
      },
      fileName,
      inMemoryArray: []
    }

    allFiles.set(type, ret)

    // this header is necessary to later differentiate between binary formats and non-binary formats
    file.write('### Decentraland json snapshot\n')

    return ret
  }

  async function writeToFile(type: EntityType | ALL_ENTITIES, buffer: string) {
    const { file, inMemoryArray } = await getFile(type)
    await new Promise<void>((resolve, reject) => {
      file.write(buffer, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    return { inMemoryArray }
  }

  return { allFiles, writeToFile, closeAllOpenFiles }
}
