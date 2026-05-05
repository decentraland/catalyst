import { AppComponents } from '../../types'
import { ProcessedSnapshotsStorageComponent } from './types'

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'logs' | 'snapshotsRepository'>
): ProcessedSnapshotsStorageComponent {
  const { database, logs, snapshotsRepository } = components
  const logger = logs.getLogger('processed-snapshot-storage')

  // In-process mirror of which snapshot hashes have already been processed.
  // Filled lazily on miss; only emptied via the explicit reset() lifecycle hook.
  // The component surface is async to match @dcl/snapshots-fetcher's interface;
  // the underlying Set is synchronous.
  const processedSnapshots = new Set<string>()

  return {
    async filterProcessedSnapshotsFrom(snapshotHashes: string[]) {
      const allCached = snapshotHashes.every((hash) => processedSnapshots.has(hash))
      if (allCached) {
        return new Set(snapshotHashes)
      }

      const fromRepo = await snapshotsRepository.getProcessedSnapshots(database, snapshotHashes)
      for (const hash of fromRepo) {
        processedSnapshots.add(hash)
      }
      return fromRepo
    },
    async markSnapshotAsProcessed(snapshotHash: string) {
      await snapshotsRepository.saveProcessedSnapshot(database, snapshotHash, Date.now())
      processedSnapshots.add(snapshotHash)
      logger.info(`Processed Snapshot saved`, { snapshotHash })
    },
    async reset() {
      processedSnapshots.clear()
    }
  }
}
