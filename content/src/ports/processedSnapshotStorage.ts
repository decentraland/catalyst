import { IProcessedSnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import { getProcessedSnapshots, saveProcessedSnapshot } from '../logic/database-queries/snapshots-queries'
import { AppComponents } from '../types'

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'clock'>
): IProcessedSnapshotStorageComponent {
  const processedSnapshotsCache = new Set()

  return {
    async processedFrom(snapshotHashes: string[]) {
      const snapshotsInCache = snapshotHashes.filter((h) => processedSnapshotsCache.has(h))
      if (snapshotsInCache.length == snapshotHashes.length) {
        return new Set(snapshotHashes)
      }
      const processedSnapshots = await getProcessedSnapshots(components, snapshotHashes)
      for (const processedSnapshot of processedSnapshots) {
        processedSnapshotsCache.add(processedSnapshot)
      }

      return processedSnapshots
    },
    async saveProcessed(snapshotHash: string) {
      await saveProcessedSnapshot(components.database, snapshotHash, components.clock.now())
      processedSnapshotsCache.add(snapshotHash)
    }
  }
}
