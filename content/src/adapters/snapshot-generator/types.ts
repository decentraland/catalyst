import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'

export type SnapshotGenerator = {
  generateSnapshots: () => Promise<void>
  getCurrentSnapshots: () => SnapshotMetadata[] | undefined
}
