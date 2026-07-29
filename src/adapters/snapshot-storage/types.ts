import { IProcessedSnapshotStorageComponent, ISnapshotStorageComponent } from '@dcl/snapshots-fetcher'

export type SnapshotStorage = ISnapshotStorageComponent &
  IProcessedSnapshotStorageComponent & {
    reset(): Promise<void>
  }
