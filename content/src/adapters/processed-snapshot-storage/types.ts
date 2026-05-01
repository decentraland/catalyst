import { IProcessedSnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'

export type ProcessedSnapshotsStorageComponent = IProcessedSnapshotStorageComponent & {
  reset: () => Promise<void>
}
