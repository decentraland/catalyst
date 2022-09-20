import { createFileWriter, IFile } from '../ports/fileWriter'
import { AppComponents } from '../types'
import {
  deleteSnapshots,
  findSnapshotsStrictlyContainedInTimeRange,
  saveSnapshot,
  streamActiveDeploymentsInTimeRange
} from './database-queries/snapshots-queries'
import { divideTimeInYearsMonthsWeeksAndDays, isTimeRangeCoveredBy, TimeRange } from './time-range'

export type NewSnapshotMetadata = {
  hash: string
  timeRange: TimeRange
  numberOfEntities: number
  replacedSnapshotHashes?: string[]
}

export async function generateAndStoreSnapshot(
  components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>,
  timeRange: TimeRange
): Promise<{
  hash: string
  numberOfEntities: number
}> {
  let numberOfEntities = 0
  let fileWriter: IFile | undefined
  try {
    fileWriter = await createFileWriter(components, 'tmp-all-entities-snapshot')
    // this header is necessary to later differentiate between binary formats and non-binary formats
    await fileWriter.appendDebounced('### Decentraland json snapshot\n')
    for await (const snapshotElem of streamActiveDeploymentsInTimeRange(components, timeRange)) {
      if (components.denylist.isDenylisted(snapshotElem.entityId)) {
        continue
      }
      const stringifiedElement = JSON.stringify(snapshotElem) + '\n'
      await fileWriter.appendDebounced(stringifiedElement)
      numberOfEntities++
    }
  } finally {
    if (fileWriter) await fileWriter.close()
  }

  return {
    hash: await fileWriter.store(),
    numberOfEntities
  }
}

export async function generateSnapshotsInMultipleTimeRanges(
  components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>,
  timeRangeToDivide: TimeRange
): Promise<NewSnapshotMetadata[]> {
  const logger = components.logs.getLogger('snapshot-generation')
  const snapshotMetadatas: NewSnapshotMetadata[] = []
  const timeRangeDivision = divideTimeInYearsMonthsWeeksAndDays(timeRangeToDivide)
  for (const timeRange of timeRangeDivision.intervals) {
    const savedSnapshots = await findSnapshotsStrictlyContainedInTimeRange(components, timeRange)

    const isTimeRangeCoveredByOtherSnapshots = isTimeRangeCoveredBy(
      timeRange,
      savedSnapshots.map((s) => s.timeRange)
    )
    const multipleSnapshotsShouldBeReplaced = isTimeRangeCoveredByOtherSnapshots && savedSnapshots.length > 1
    const shouldGenerateNewSnapshot = !isTimeRangeCoveredByOtherSnapshots || multipleSnapshotsShouldBeReplaced

    if (shouldGenerateNewSnapshot) {
      const { hash, numberOfEntities } = await generateAndStoreSnapshot(components, timeRange)
      const replacedSnapshotHashes = savedSnapshots.map((s) => s.hash)
      await components.database.transaction(async (txDatabase) => {
        if (replacedSnapshotHashes.length > 0) {
          await deleteSnapshots(txDatabase, replacedSnapshotHashes)
          await components.storage.delete(replacedSnapshotHashes)
        }
        const newSnapshot = { hash, timeRange, replacedSnapshotHashes, numberOfEntities }
        await saveSnapshot(txDatabase, newSnapshot, Math.floor(Date.now() / 1000))
        snapshotMetadatas.push(newSnapshot)
      })
      logger.info(
        `New snapshot generated for interval: [${timeRange.initTimestampSecs}, ${timeRange.endTimestampSecs}].`
      )
    } else {
      for (const snapshotMetadata of savedSnapshots) {
        snapshotMetadatas.push(snapshotMetadata)
      }
    }
  }
  return snapshotMetadatas
}
