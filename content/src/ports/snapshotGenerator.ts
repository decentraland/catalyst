import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'
import { generateSnapshotsInMultipleTimeRanges } from '../logic/snapshots'
import { AppComponents } from '../types'

export type SnapshotGenerator = {
  generateSnapshots: () => Promise<void>
  getCurrentSnapshots: () => SnapshotMetadata[] | undefined
}

export function createSnapshotGenerator(
  components: Pick<
    AppComponents,
    'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs' | 'clock'
  >
): SnapshotGenerator {
  let currentSnapshots: SnapshotMetadata[] | undefined

  return {
    async generateSnapshots() {
      currentSnapshots = await generateSnapshotsInMultipleTimeRanges(components, {
        // IT IS IMPORTANT THIS TIMESTAMP NEVER CHANGES; IF IT DOES, THE WHOLE SNAPSHOTS SET WILL BE REGENERATED.
        initTimestamp: 1577836800000,
        endTimestamp: components.clock.now()
      })
    },
    getCurrentSnapshots(): SnapshotMetadata[] | undefined {
      return currentSnapshots
    }
  }
}
