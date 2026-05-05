import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { AppComponents } from '../../types'
import { ProcessedSnapshotsStorageComponent } from './types'

// All processed-snapshot hashes live as fields under a single cache hash so the
// "all cached?" check is one cache call (then a sync `in`-check), and reset() drops
// the entire hash with a single remove(). Cache misses still fall through to the
// repository, so default LRU/TTL semantics on the underlying entry are fine.
const PROCESSED_SNAPSHOTS_HASH = 'processed-snapshots'

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'logs' | 'snapshotsRepository'>
): ProcessedSnapshotsStorageComponent {
  const { database, logs, snapshotsRepository } = components
  const logger = logs.getLogger('processed-snapshot-storage')
  const cache = createInMemoryCacheComponent()

  return {
    async filterProcessedSnapshotsFrom(snapshotHashes: string[]) {
      const cached = await cache.getAllHashFields<true>(PROCESSED_SNAPSHOTS_HASH)
      const allCached = snapshotHashes.every((hash) => hash in cached)
      if (allCached) {
        return new Set(snapshotHashes)
      }

      const processedSnapshots = await snapshotsRepository.getProcessedSnapshots(database, snapshotHashes)
      for (const hash of processedSnapshots) {
        await cache.setInHash(PROCESSED_SNAPSHOTS_HASH, hash, true)
      }
      return processedSnapshots
    },
    async markSnapshotAsProcessed(snapshotHash: string) {
      await snapshotsRepository.saveProcessedSnapshot(database, snapshotHash, Date.now())
      await cache.setInHash(PROCESSED_SNAPSHOTS_HASH, snapshotHash, true)
      logger.info(`Processed Snapshot saved`, { snapshotHash })
    },
    async reset() {
      await cache.remove(PROCESSED_SNAPSHOTS_HASH)
    }
  }
}
