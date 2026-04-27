import { IProcessedSnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import { getProcessedSnapshots, saveProcessedSnapshot } from '../adapters/snapshots-repository'
import { AppComponents } from '../types'

export type ProcessedSnapshotsStorageComponent = IProcessedSnapshotStorageComponent & { reset: () => void }

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'logs'>
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
      await saveProcessedSnapshot(components.database, snapshotHash, Date.now())
      processedSnapshotsCache.add(snapshotHash)
      logger.info(`Processed Snapshot saved`, { snapshotHash })
    },
    reset() {
      processedSnapshotsCache.clear()
    }
  }
}
