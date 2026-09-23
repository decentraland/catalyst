import { SnapshotMetadata, TimeRange } from '@dcl/snapshots-fetcher'
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
  ): Promise<{ hash: string; numberOfEntities: number; generationTimestamp: number }> {
    const { end: endTimer } = metrics.startTimer('dcl_content_server_snapshot_generation_time', {
      interval_size: intervalSizeLabel(timeRange),
      reason: reason || 'unknown'
    })
    let numberOfEntities = 0
    let fileWriter: IFile | undefined
    let stored = false
    try {
      // Capture the generation time BEFORE opening the stream. The stream runs on a single MVCC
      // snapshot taken at query start, so any deployment committed while it runs is not included; a
      // timestamp taken after the stream would be later than that deploy's commit, and
      // `snapshotIsOutdated` (local_timestamp > generation_time) would then never flag the snapshot
      // for regeneration — the deployment would be missing from snapshots forever.
      const generationTimestamp = Date.now()
      fileWriter = await createFileWriter(components, 'tmp-all-entities-snapshot')
      // Header marks this as the json format (vs. the binary format) for downstream readers.
      await fileWriter.appendDebounced('### Decentraland json snapshot\n')
      for await (const snapshotElem of snapshotsRepository.streamActiveDeploymentsInTimeRange(db, timeRange)) {
        const stringifiedElement = JSON.stringify(snapshotElem) + '\n'
        await fileWriter.appendDebounced(stringifiedElement)
        numberOfEntities++
      }
      const storedHash = await fileWriter.store()
      stored = true
      endTimer({ result: 'success' })
      return { hash: storedHash, numberOfEntities, generationTimestamp }
    } catch (error) {
      endTimer({ result: 'error' })
      throw error
    } finally {
      if (fileWriter) {
        await fileWriter.close()
        // On failure `store()` never ran (or didn't finish), so remove the partial tmp file. Without
        // this, failed/crashed generations of multi-GB snapshots accumulate in the contents folder.
        if (!stored) {
          await fileWriter.delete()
        }
      }
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

        const { hash, numberOfEntities, generationTimestamp } = await generateAndStoreSnapshot(
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
        const replacedSnapshotHashes =
          isTimeRangeCoveredByOtherSnapshots || snapshotHasInactiveEntities ? savedSnapshotHashes : []
        const newSnapshot = {
          hash,
          timeRange,
          replacedSnapshotHashes,
          numberOfEntities,
          // Use the timestamp captured before the deployment stream opened (see generateAndStoreSnapshot).
          generationTimestamp
        }
        let snapshotHashesToDeleteInStorage: string[] = []
        await database.transaction(async (txDatabase) => {
          const snapshotHashesUsedInOtherTimeRanges = await snapshotsRepository.getSnapshotHashesNotInTimeRange(
            txDatabase,
            savedSnapshotHashes,
            timeRange
          )
          snapshotHashesToDeleteInStorage = savedSnapshotHashes.filter(
            (hash) => !snapshotHashesUsedInOtherTimeRanges.has(hash) && hash != newSnapshot.hash
          )
          // The order is important; a snapshot we save can share its hash with one we delete.
          await snapshotsRepository.deleteSnapshotsInTimeRange(txDatabase, savedSnapshotHashes, timeRange)
          await snapshotsRepository.saveSnapshot(txDatabase, newSnapshot)
        }, 'tx_snapshot')

        // Delete the replaced snapshot files only after the transaction commits. Deleting inside the
        // transaction risks leaving committed DB rows pointing at files that were already removed if
        // the commit failed; a leftover file after a successful commit is merely reclaimed next run.
        snapshotMetadatas.push(newSnapshot)
        logger.info(`Snapshots to delete: ${JSON.stringify(snapshotHashesToDeleteInStorage)}`)
        await storage.delete(snapshotHashesToDeleteInStorage)
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

  // Cache of the most recent scheduled-generation run. Status endpoints read from this;
  // the underlying `generateSnapshotsInMultipleTimeRanges` streams the DB and is too
  // expensive to invoke per request.
  let currentSnapshots: SnapshotMetadata[] | undefined

  async function runScheduledGeneration(): Promise<void> {
    currentSnapshots = await generateSnapshotsInMultipleTimeRanges({
      // IT IS IMPORTANT THIS TIMESTAMP NEVER CHANGES; IF IT DOES, THE WHOLE SNAPSHOTS SET WILL BE REGENERATED.
      initTimestamp: 1577836800000,
      endTimestamp: Date.now()
    })
  }

  function getCurrentSnapshots(): SnapshotMetadata[] | undefined {
    return currentSnapshots
  }

  return {
    generateAndStoreSnapshot,
    generateSnapshotsInMultipleTimeRanges,
    runScheduledGeneration,
    getCurrentSnapshots
  }
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
