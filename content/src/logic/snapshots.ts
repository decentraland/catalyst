import { createFileWriter, IFile } from '../ports/fileWriter'
import { AppComponents } from '../types'
import {
  deleteSnapshots,
  findSnapshotsStrictlyContainedInTimeRange,
  saveSnapshot,
  streamActiveDeploymentsInTimeRange
} from './database-queries/snapshots-queries'
import { divideTimeInYearsMonthsWeeksAndDays, intervalSizeLabel, isTimeRangeCoveredBy, TimeRange } from './time-range'

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
  const { end: endTimer } = components.metrics.startTimer('dcl_content_server_snapshot_generation_time', {
    interval_size: intervalSizeLabel(timeRange)
  })
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
    const storedHash = await fileWriter.store()
    endTimer({ result: 'success' })
    return {
      hash: storedHash,
      numberOfEntities
    }
  } catch (error) {
    endTimer({ result: 'error' })
    throw error
  } finally {
    if (fileWriter) await fileWriter.close()
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
      const savedSnapshotHashes = savedSnapshots.map((s) => s.hash)
      await components.database.transaction(async (txDatabase) => {
        const replacedSnapshotHashes = isTimeRangeCoveredByOtherSnapshots ? savedSnapshotHashes : []
        const newSnapshot = { hash, timeRange, replacedSnapshotHashes, numberOfEntities }
        await saveSnapshot(txDatabase, newSnapshot, Math.floor(Date.now() / 1000))
        if (savedSnapshotHashes.length > 0) {
          await deleteSnapshots(txDatabase, savedSnapshotHashes)
          await components.storage.delete(savedSnapshotHashes)
        }
        snapshotMetadatas.push(newSnapshot)
      })
      logger.info(`Snapshot generated for interval: [${timeRange.initTimestampSecs}, ${timeRange.endTimestampSecs}].`)
    } else {
      snapshotMetadatas.push(...savedSnapshots)
    }
  }
  return snapshotMetadatas
}
