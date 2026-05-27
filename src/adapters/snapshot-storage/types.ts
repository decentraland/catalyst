import { IProcessedSnapshotStorageComponent, ISnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'

export type SnapshotStorage = ISnapshotStorageComponent &
  IProcessedSnapshotStorageComponent & {
    reset(): Promise<void>
  }
