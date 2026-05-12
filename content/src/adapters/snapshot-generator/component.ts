import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'
import { AppComponents } from '../../types'
import { SnapshotGenerator } from './types'

export function createSnapshotGenerator(components: Pick<AppComponents, 'snapshots'>): SnapshotGenerator {
  const { snapshots } = components
  let currentSnapshots: SnapshotMetadata[] | undefined

  return {
    async generateSnapshots() {
      currentSnapshots = await snapshots.generateSnapshotsInMultipleTimeRanges({
        // IT IS IMPORTANT THIS TIMESTAMP NEVER CHANGES; IF IT DOES, THE WHOLE SNAPSHOTS SET WILL BE REGENERATED.
        initTimestamp: 1577836800000,
        endTimestamp: Date.now()
      })
    },
    getCurrentSnapshots(): SnapshotMetadata[] | undefined {
      return currentSnapshots
    }
  }
}
