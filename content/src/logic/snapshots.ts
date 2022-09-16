import { hashV1 } from '@dcl/hashing'
import { EntityType } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createContentFileWriterComponent } from '../ports/contentFileWriter'
import { AppComponents } from '../types'
import {
  deleteSnapshots,
  findSnapshotsStrictlyContainedInTimeRange,
  saveSnapshot,
  streamActiveDeploymentsInTimeRange
} from './database-queries/snapshots-queries'
import { divideTimeRange, isTimeRangeCoveredBy, TimeRange } from './time-range'

export const ALL_ENTITIES = Symbol('allEntities')
export type ALL_ENTITIES = typeof ALL_ENTITIES
// const NAME_FOR_STATUS_ENDPOINT = 'snapshot'

export type NewSnapshotMetadata = {
  hash: string
  timerange: TimeRange
  numberOfEntities: number
  replacedSnapshotHashes?: string[]
}

async function moveSnapshotFileToContentFolder(
  components: Pick<AppComponents, 'storage' | 'fs'>,
  tmpFile: string,
  hash: string,
  timeRange: TimeRange,
  logger: ILoggerComponent.ILogger
) {
  const hasContent = await components.storage.retrieve(hash)

  if (!hasContent) {
    // move and compress the file into the destinationFilename
    await components.storage.storeStreamAndCompress(hash, components.fs.createReadStream(tmpFile))
    logger.info(
      `Generated snapshot. hash=${hash} timeRange=[${timeRange.initTimestampSecs}, ${timeRange.endTimestampSecs}]`
    )
  }
}

type SnapshotGenerationResult = {
  hash: string
  numberOfEntities: number
}

export async function generateSnapshots(
  components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>,
  timeRange: TimeRange,
  snapshotTypes: Set<ALL_ENTITIES | EntityType>
): Promise<Map<EntityType | ALL_ENTITIES, SnapshotGenerationResult>> {
  const logger = components.logs.getLogger('snapshot-generation')
  const { end: stopTimer } = components.metrics.startTimer('dcl_content_snapshot_generation_time', {
    entity_type: snapshotTypes.has(ALL_ENTITIES)
      ? ALL_ENTITIES.description ?? 'allEntities'
      : Array.from(snapshotTypes).join(':')
  })

  const snapshotHashes: Map<EntityType | ALL_ENTITIES, SnapshotGenerationResult> = new Map()

  const fileWriterComponent = createContentFileWriterComponent<EntityType | ALL_ENTITIES>(components, 'new-')

  const newActiveEntitiesCount = {}

  // this header is necessary to later differentiate between binary formats and non-binary formats
  const FILE_HEADER = '### Decentraland json snapshot\n'

  // Phase 1) pre-open all the files and write the headers
  for (const entityType of snapshotTypes) {
    await fileWriterComponent.appendToFile(entityType, FILE_HEADER)
    newActiveEntitiesCount[entityType.toString()] = 0
    if (entityType === ALL_ENTITIES) {
      Object.keys(EntityType).forEach((t) => (newActiveEntitiesCount[t.toString().toLocaleLowerCase()] = 0))
    }
  }

  // Phase 2) iterate all active deployments and write to files
  try {
    for await (const snapshotElem of streamActiveDeploymentsInTimeRange(components, timeRange, snapshotTypes)) {
      if (components.denylist.isDenylisted(snapshotElem.entityId)) {
        continue
      }

      const stringifiedElement = JSON.stringify(snapshotElem) + '\n'

      // write deployment to ALL_ENTITIES file
      await fileWriterComponent.appendToFile(ALL_ENTITIES, stringifiedElement)

      // write deployment to entityType file
      await fileWriterComponent.appendToFile(snapshotElem.entityType as EntityType, stringifiedElement)

      newActiveEntitiesCount[snapshotElem.entityType]++
    }
  } finally {
    await fileWriterComponent.flushToDiskAndCloseFiles()
  }

  console.log(newActiveEntitiesCount)
  // Phase 3) hash generated files and move them to content folder
  try {
    // compress and commit
    for (const [entityType, { fileName }] of fileWriterComponent.allFiles) {
      // Hash the snapshot
      const hash = await hashV1(components.fs.createReadStream(fileName) as any)

      // if success move the file to the contents folder
      await moveSnapshotFileToContentFolder(components, fileName, hash, timeRange, logger)

      // Save the snapshot hash and metadata
      snapshotHashes.set(entityType, { hash, numberOfEntities: newActiveEntitiesCount[entityType.toString()] })
    }
  } catch (err: any) {
    stopTimer({ failed: 'true' })
    logger.error(err)
  } finally {
    stopTimer({ failed: 'false' })
  }
  await fileWriterComponent.deleteAllFiles()

  return snapshotHashes
}

export async function generateSnapshotsInMultipleTimeRanges(
  components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>,
  fromTimestampSecs: number
) {
  // change fromTimestampSecs to genesis time
  const timeline: TimeRange = {
    initTimestampSecs: fromTimestampSecs,
    endTimestampSecs: Math.floor(Date.now() / 1000)
  }
  const timeRangeDivision = divideTimeRange(timeline)
  for (const interval of timeRangeDivision.intervals) {
    const allEntitiesSnapshots = await findSnapshotsStrictlyContainedInTimeRange(components, interval)

    const isTimeRangeCoveredByOtherSnapshots = isTimeRangeCoveredBy(
      interval,
      allEntitiesSnapshots.map((s) => s.timerange)
    )
    const multipleSnapshotsShouldBeReplaced = isTimeRangeCoveredByOtherSnapshots && allEntitiesSnapshots.length > 1
    const shouldGenerateNewSnapshot = !isTimeRangeCoveredByOtherSnapshots || multipleSnapshotsShouldBeReplaced

    if (shouldGenerateNewSnapshot) {
      const snapshotHashes = await generateSnapshots(components, interval, new Set([ALL_ENTITIES, EntityType.EMOTE]))
      const allEntitiesGenerationResult = snapshotHashes.get(ALL_ENTITIES)
      if (allEntitiesGenerationResult) {
        const { hash, numberOfEntities } = allEntitiesGenerationResult
        const replacedSnapshotHashes = allEntitiesSnapshots.map((s) => s.hash)
        await components.database.transaction(async (txDatabase) => {
          if (replacedSnapshotHashes.length > 0) {
            await deleteSnapshots(txDatabase, replacedSnapshotHashes)
          }
          await saveSnapshot(
            txDatabase,
            { hash, timerange: interval, replacedSnapshotHashes, numberOfEntities },
            Math.floor(Date.now() / 1000)
          )
        })
      }
      console.log('generated snapshots finished!')
    }
  }
}
