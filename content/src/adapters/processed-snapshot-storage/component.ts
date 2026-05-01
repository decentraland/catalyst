import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { getProcessedSnapshots, saveProcessedSnapshot } from '../snapshots-repository'
import { AppComponents } from '../../types'
import { ProcessedSnapshotsStorageComponent } from './types'

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'logs'>
): ProcessedSnapshotsStorageComponent {
  const { database, logs } = components
  const logger = logs.getLogger('processed-snapshot-storage')
  const cache = createInMemoryCacheComponent()

  return {
    async filterProcessedSnapshotsFrom(snapshotHashes: string[]) {
      const cacheHits = await Promise.all(snapshotHashes.map((h) => cache.get<true>(h)))
      const allCached = cacheHits.every((hit) => hit !== null)
      if (allCached) {
        return new Set(snapshotHashes)
      }

      const processedSnapshots = await getProcessedSnapshots(database, snapshotHashes)
      await Promise.all(Array.from(processedSnapshots).map((hash) => cache.set(hash, true)))
      return processedSnapshots
    },
    async markSnapshotAsProcessed(snapshotHash: string) {
      await saveProcessedSnapshot(database, snapshotHash, Date.now())
      await cache.set(snapshotHash, true)
      logger.info(`Processed Snapshot saved`, { snapshotHash })
    },
    async reset() {
      const keys = await cache.keys()
      await Promise.all(keys.map((key) => cache.remove(key)))
    }
  }
}
