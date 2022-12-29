import { createFileWriter, IFile } from '../ports/fileWriter'
import { AppComponents } from '../types'
import {
  deleteSnapshotsInTimeRange,
  findSnapshotsStrictlyContainedInTimeRange,
  getNumberOfActiveEntitiesInTimeRange,
  getSnapshotHashesNotInTimeRange,
  saveSnapshot,
  snapshotIsOutdated,
  streamActiveDeploymentsInTimeRange
} from './database-queries/snapshots-queries'
import {
  divideTimeInYearsMonthsWeeksAndDays,
  intervalSizeLabel,
  isTimeRangeCoveredBy,
  MS_PER_MONTH,
  TimeRange
} from './time-range'

export type NewSnapshotMetadata = {
  hash: string
  timeRange: TimeRange
  numberOfEntities: number
  replacedSnapshotHashes?: string[]
  generationTimestamp: number
}

export async function generateAndStoreSnapshot(
  components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>,
  timeRange: TimeRange,
  reason?: string
): Promise<{
  hash: string
  numberOfEntities: number
}> {
  const { end: endTimer } = components.metrics.startTimer('dcl_content_server_snapshot_generation_time', {
    interval_size: intervalSizeLabel(timeRange),
    reason: reason || 'unknown'
  })
  let numberOfEntities = 0
  let fileWriter: IFile | undefined
  try {
    fileWriter = await createFileWriter(components, 'tmp-all-entities-snapshot')
    // this header is necessary to later differentiate between binary formats and non-binary formats
    await fileWriter.appendDebounced('### Decentraland json snapshot\n')
    for await (const snapshotElem of streamActiveDeploymentsInTimeRange(components, timeRange)) {
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
  components: Pick<
    AppComponents,
    'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs' | 'clock' | 'storage'
  >,
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
    const existSnapshots = await components.storage.existMultiple(savedSnapshots.map((s) => s.hash))
    const allSavedSnapshotsAreStored = Array.from(existSnapshots.values()).every((exist) => exist == true)
    const snapshotHasInactiveEntities =
      savedSnapshots.length == 1 &&
      // If snapshot is 1 month old, we recompile it if there are inactive entities
      savedSnapshots[0].generationTimestamp < Date.now() - MS_PER_MONTH &&
      (await getNumberOfActiveEntitiesInTimeRange(components, savedSnapshots[0].timeRange)) <
        savedSnapshots[0].numberOfEntities

    const isOutdated = savedSnapshots.length == 1 && (await snapshotIsOutdated(components, savedSnapshots[0]))

    const shouldGenerateNewSnapshot =
      !isTimeRangeCoveredByOtherSnapshots ||
      multipleSnapshotsShouldBeReplaced ||
      !allSavedSnapshotsAreStored ||
      snapshotHasInactiveEntities ||
      isOutdated

    if (shouldGenerateNewSnapshot) {
      logger.info(
        JSON.stringify({
          generatingInterval: `[${new Date(timeRange.initTimestamp).toISOString()}, ${new Date(
            timeRange.endTimestamp
          ).toISOString()}]`,
          isTimeRangeCoveredByOtherSnapshots,
          multipleSnapshotsShouldBeReplaced,
          allSavedSnapshotsAreStored,
          snapshotHasInactiveEntities,
          isOutdated
        })
      )

      const { hash, numberOfEntities } = await generateAndStoreSnapshot(
        components,
        timeRange,
        getReasonForMetric({
          isTimeRangeCoveredByOtherSnapshots,
          multipleSnapshotsShouldBeReplaced,
          allSavedSnapshotsAreStored,
          snapshotHasInactiveEntities,
          isOutdated
        })
      )
      const savedSnapshotHashes = savedSnapshots.map((s) => s.hash)
      await components.database.transaction(async (txDatabase) => {
        const replacedSnapshotHashes =
          isTimeRangeCoveredByOtherSnapshots || snapshotHasInactiveEntities ? savedSnapshotHashes : []
        const newSnapshot = {
          hash,
          timeRange,
          replacedSnapshotHashes,
          numberOfEntities,
          generationTimestamp: components.clock.now()
        }
        const snapshotHashesUsedInOtherTimeRanges = await getSnapshotHashesNotInTimeRange(
          txDatabase,
          savedSnapshotHashes,
          timeRange
        )
        const snapshotHashesToDeleteInStorage = savedSnapshotHashes.filter(
          (hash) => !snapshotHashesUsedInOtherTimeRanges.has(hash) && hash != newSnapshot.hash
        )
        // The order is important, the snapshot to save could have the same hash of one of the ones to be deleted
        await deleteSnapshotsInTimeRange(txDatabase, savedSnapshotHashes, timeRange)
        await saveSnapshot(txDatabase, newSnapshot)
        logger.info(`Snapshots to delete: ${JSON.stringify(Array.from(snapshotHashesToDeleteInStorage))}`)
        await components.storage.delete(snapshotHashesToDeleteInStorage)
        snapshotMetadatas.push(newSnapshot)
      })
      logger.info(
        `Snapshot generated for interval: [${new Date(timeRange.initTimestamp).toISOString()}, ${new Date(
          timeRange.endTimestamp
        ).toISOString()}]. Hash: ${hash}.`
      )
    } else {
      snapshotMetadatas.push(...savedSnapshots)
    }
  }
  return snapshotMetadatas
}

function getReasonForMetric(props: {
  isTimeRangeCoveredByOtherSnapshots: boolean
  multipleSnapshotsShouldBeReplaced: boolean
  allSavedSnapshotsAreStored: boolean
  snapshotHasInactiveEntities: boolean
  isOutdated: boolean
}): string {
  if (!props.isTimeRangeCoveredByOtherSnapshots) {
    return 'cover_time_range'
  } else if (props.multipleSnapshotsShouldBeReplaced) {
    return 'replace_multiple_snapshots'
  } else if (!props.allSavedSnapshotsAreStored) {
    return 'snapshots_not_stored'
  } else if (props.snapshotHasInactiveEntities) {
    return 'inactive_entities'
  } else if (props.isOutdated) {
    return 'is_outdated'
  }
  return 'unkown'
}
