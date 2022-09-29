import { IProcessedSnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import { getProcessedSnapshots, saveProcessedSnapshot } from '../logic/database-queries/snapshots-queries'
import { AppComponents } from '../types'

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'logs'>
): IProcessedSnapshotStorageComponent {
  const logger = components.logs.getLogger('processed-snapshot-storage')
  return {
    async wasSnapshotProcessed(hash: string, replacedSnapshotHashes?: string[]): Promise<boolean> {
      const replacedHashes = replacedSnapshotHashes ?? []
      const hashesToGet = replacedHashes.length > 0 ? [hash, ...replacedHashes] : [hash]
      const processedSnapshotHashes = await getProcessedSnapshots(components, hashesToGet)
      return (
        processedSnapshotHashes.has(hash) ||
        (replacedHashes.length > 0 && replacedHashes.every((h) => processedSnapshotHashes.has(h)))
      )
    },
    async markSnapshotProcessed(hash: string): Promise<void> {
      await saveProcessedSnapshot(components, hash, Math.floor(Date.now() / 1000))
      logger.info(`Snapshot ${hash} successfully processed and saved.`)
    }
  }
}
