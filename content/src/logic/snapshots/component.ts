import { SnapshotMetadata, TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { createFileWriter, IFile } from '../../adapters/content-file-writer'
import { DatabaseClient } from '../../adapters/database'
import { AppComponents } from '../../types'
import {
  divideTimeInYearsMonthsWeeksAndDays,
  intervalSizeLabel,
  isTimeRangeCoveredBy,
  MS_PER_MONTH
} from '../time-range'
import { ISnapshots } from './types'

export function createSnapshots(
  components: Pick<
    AppComponents,
    'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs' | 'snapshotsRepository'
  >
): ISnapshots {
  const { database, metrics, storage, logs, snapshotsRepository } = components

  async function generateAndStoreSnapshot(
    db: DatabaseClient,
    timeRange: TimeRange,
    reason?: string
  ): Promise<{ hash: string; numberOfEntities: number }> {
    const { end: endTimer } = metrics.startTimer('dcl_content_server_snapshot_generation_time', {
      interval_size: intervalSizeLabel(timeRange),
      reason: reason || 'unknown'
    })
    let numberOfEntities = 0
    let fileWriter: IFile | undefined
    try {
      fileWriter = await createFileWriter(components, 'tmp-all-entities-snapshot')
      // Header marks this as the json format (vs. the binary format) for downstream readers.
      await fileWriter.appendDebounced('### Decentraland json snapshot\n')
      for await (const snapshotElem of snapshotsRepository.streamActiveDeploymentsInTimeRange(db, timeRange)) {
        const stringifiedElement = JSON.stringify(snapshotElem) + '\n'
        await fileWriter.appendDebounced(stringifiedElement)
        numberOfEntities++
      }
      const storedHash = await fileWriter.store()
      endTimer({ result: 'success' })
      return { hash: storedHash, numberOfEntities }
    } catch (error) {
      endTimer({ result: 'error' })
      throw error
    } finally {
      if (fileWriter) await fileWriter.close()
    }
  }

  async function generateSnapshotsInMultipleTimeRanges(timeRangeToDivide: TimeRange): Promise<SnapshotMetadata[]> {
    const logger = logs.getLogger('snapshot-generation')
    const snapshotMetadatas: SnapshotMetadata[] = []
    const timeRangeDivision = divideTimeInYearsMonthsWeeksAndDays(timeRangeToDivide)
    for (const timeRange of timeRangeDivision.intervals) {
      const savedSnapshots = await snapshotsRepository.findSnapshotsStrictlyContainedInTimeRange(database, timeRange)

      const isTimeRangeCoveredByOtherSnapshots = isTimeRangeCoveredBy(
        timeRange,
        savedSnapshots.map((s) => s.timeRange)
      )
      const multipleSnapshotsShouldBeReplaced = isTimeRangeCoveredByOtherSnapshots && savedSnapshots.length > 1
      const existSnapshots = await storage.existMultiple(savedSnapshots.map((s) => s.hash))
      const allSavedSnapshotsAreStored = Array.from(existSnapshots.values()).every((exist) => exist == true)
      const snapshotHasInactiveEntities =
        savedSnapshots.length == 1 &&
        // If snapshot is 1 month old, we recompile it if there are inactive entities
        savedSnapshots[0].generationTimestamp < Date.now() - MS_PER_MONTH &&
        (await snapshotsRepository.getNumberOfActiveEntitiesInTimeRange(database, savedSnapshots[0].timeRange)) <
          savedSnapshots[0].numberOfEntities

      const isOutdated =
        savedSnapshots.length == 1 && (await snapshotsRepository.snapshotIsOutdated(database, savedSnapshots[0]))

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
          database,
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
        await database.transaction(async (txDatabase) => {
          const replacedSnapshotHashes =
            isTimeRangeCoveredByOtherSnapshots || snapshotHasInactiveEntities ? savedSnapshotHashes : []
          const newSnapshot = {
            hash,
            timeRange,
            replacedSnapshotHashes,
            numberOfEntities,
            generationTimestamp: Date.now()
          }
          const snapshotHashesUsedInOtherTimeRanges = await snapshotsRepository.getSnapshotHashesNotInTimeRange(
            txDatabase,
            savedSnapshotHashes,
            timeRange
          )
          const snapshotHashesToDeleteInStorage = savedSnapshotHashes.filter(
            (hash) => !snapshotHashesUsedInOtherTimeRanges.has(hash) && hash != newSnapshot.hash
          )
          // The order is important; a snapshot we save can share its hash with one we delete.
          await snapshotsRepository.deleteSnapshotsInTimeRange(txDatabase, savedSnapshotHashes, timeRange)
          await snapshotsRepository.saveSnapshot(txDatabase, newSnapshot)
          logger.info(`Snapshots to delete: ${JSON.stringify(Array.from(snapshotHashesToDeleteInStorage))}`)
          await storage.delete(snapshotHashesToDeleteInStorage)
          snapshotMetadatas.push(newSnapshot)
        }, 'tx_snapshot')
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

  return { generateAndStoreSnapshot, generateSnapshotsInMultipleTimeRanges }
}

function getReasonForMetric(props: {
  isTimeRangeCoveredByOtherSnapshots: boolean
  multipleSnapshotsShouldBeReplaced: boolean
  allSavedSnapshotsAreStored: boolean
  snapshotHasInactiveEntities: boolean
  isOutdated: boolean
}): string {
  if (!props.isTimeRangeCoveredByOtherSnapshots) return 'cover_time_range'
  if (props.multipleSnapshotsShouldBeReplaced) return 'replace_multiple_snapshots'
  if (!props.allSavedSnapshotsAreStored) return 'snapshots_not_stored'
  if (props.snapshotHasInactiveEntities) return 'inactive_entities'
  if (props.isOutdated) return 'is_outdated'
  return 'unknown'
}
