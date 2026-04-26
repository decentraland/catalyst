import { SnapshotSyncDeployment } from '@dcl/schemas'
import { SnapshotMetadata, TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { DatabaseClient } from '../../ports/postgres'

export interface ISnapshotsRepository {
  streamActiveDeploymentsInTimeRange(db: DatabaseClient, timeRange: TimeRange): AsyncIterable<SnapshotSyncDeployment>
  findSnapshotsStrictlyContainedInTimeRange(db: DatabaseClient, timerange: TimeRange): Promise<SnapshotMetadata[]>
  saveSnapshot(db: DatabaseClient, snapshotMetadata: SnapshotMetadata): Promise<void>
  isOwnSnapshot(db: DatabaseClient, snapshotHash: string): Promise<boolean>
  getSnapshotHashesNotInTimeRange(
    db: DatabaseClient,
    snapshotHashes: string[],
    timeRange: TimeRange
  ): Promise<Set<string>>
  deleteSnapshotsInTimeRange(db: DatabaseClient, snapshotHashesToDelete: string[], timeRange: TimeRange): Promise<void>
  snapshotIsOutdated(db: DatabaseClient, snapshot: SnapshotMetadata): Promise<boolean>
  getNumberOfActiveEntitiesInTimeRange(db: DatabaseClient, timeRange: TimeRange): Promise<number>
  saveProcessedSnapshot(db: DatabaseClient, processedSnapshotHash: string, processTimestampMs: number): Promise<void>
  getProcessedSnapshots(db: DatabaseClient, processedSnapshotHashes: string[]): Promise<Set<string>>
  getAllSnapshotHashes(db: DatabaseClient): AsyncIterable<string>
}
