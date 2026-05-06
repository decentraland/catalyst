import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent } from '@well-known-components/interfaces'

export type SnapshotGenerator = IBaseComponent & {
  getCurrentSnapshots(): SnapshotMetadata[] | undefined
}
