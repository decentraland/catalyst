import { SnapshotMetadata, TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { DatabaseClient } from '../../adapters/database'

export interface ISnapshots {
  /**
   * Stream every active deployment in `timeRange` into a single snapshot file and store it.
   * Returns the storage hash and the number of streamed entities. `reason` is a free-form
   * label included in metrics so generations triggered by different code paths can be told apart.
   */
  generateAndStoreSnapshot(
    database: DatabaseClient,
    timeRange: TimeRange,
    reason?: string
  ): Promise<{ hash: string; numberOfEntities: number }>

  /**
   * Divide `timeRangeToDivide` into year/month/week/day intervals and ensure each one is
   * backed by an up-to-date snapshot, regenerating when necessary (missing storage,
   * outdated, has too many inactive entities, or is covered by multiple older snapshots).
   * Returns the final metadata for every interval.
   */
  generateSnapshotsInMultipleTimeRanges(timeRangeToDivide: TimeRange): Promise<SnapshotMetadata[]>

  /**
   * Run a full snapshot generation across the whole catalyst history and cache the resulting
   * metadata in memory for status endpoints. Designed to be invoked by the recurring snapshot
   * job; the start timestamp is intentionally fixed so reruns produce stable snapshot sets.
   */
  runScheduledGeneration(): Promise<void>

  /**
   * Return the metadata produced by the most recent successful `runScheduledGeneration` call,
   * or `undefined` if the scheduled job has not completed once yet.
   */
  getCurrentSnapshots(): SnapshotMetadata[] | undefined
}
