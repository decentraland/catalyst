import { IProcessedSnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import { getProcessedSnapshots, saveProcessedSnapshot } from '../logic/database-queries/snapshots-queries'
import { AppComponents } from '../types'

export type ProcessedSnapshotsStorageComponent = IProcessedSnapshotStorageComponent & { reset: () => void }

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'clock' | 'logs'>
): ProcessedSnapshotsStorageComponent {
  const logger = components.logs.getLogger('processed-snapshot-storage')
  const processedSnapshotsCache = new Set<string>()

  return {
    async filterProcessedSnapshotsFrom(snapshotHashes: string[]) {
      const snapshotsInCache = snapshotHashes.filter((h) => processedSnapshotsCache.has(h))
      if (snapshotsInCache.length == snapshotHashes.length) {
        return new Set(snapshotHashes)
      }
      const processedSnapshots = await getProcessedSnapshots(components.database, snapshotHashes)
      for (const processedSnapshot of processedSnapshots) {
        processedSnapshotsCache.add(processedSnapshot)
      }

      return processedSnapshots
    },
    async markSnapshotAsProcessed(snapshotHash: string) {
      await saveProcessedSnapshot(components.database, snapshotHash, components.clock.now())
      processedSnapshotsCache.add(snapshotHash)
      logger.info(`Processed Snapshot saved`, { snapshotHash })
    },
    reset() {
      processedSnapshotsCache.clear()
    }
  }
}
