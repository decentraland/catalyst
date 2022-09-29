import { IProcessedSnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import {
  deleteProcessedSnapshots,
  getProcessedSnapshots,
  saveProcessedSnapshot
} from '../logic/database-queries/snapshots-queries'
import { AppComponents } from '../types'

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'logs'>
): IProcessedSnapshotStorageComponent {
  const logger = components.logs.getLogger('processed-snapshot-storage')
  return {
    async wasSnapshotProcessed(hash: string, replacedSnapshotHashes?: string[]): Promise<boolean> {
      const replacedHashes = replacedSnapshotHashes ?? []
      const hashesToGet = [hash, ...replacedHashes]
      const processedSnapshotHashes = await getProcessedSnapshots(components, hashesToGet)

      const snapshotWasAlreadyProcessed = processedSnapshotHashes.has(hash)
      const replacedHashesWereAlreadyProcessed =
        replacedHashes.length > 0 && replacedHashes.every((h) => processedSnapshotHashes.has(h))

      if (!snapshotWasAlreadyProcessed && replacedHashesWereAlreadyProcessed) {
        await components.database.transaction(async (txDatabase) => {
          await deleteProcessedSnapshots(txDatabase, replacedHashes)
          await saveProcessedSnapshot(txDatabase, hash, Math.floor(Date.now() / 1000))
        }, 'replace_processed_snapshots')
      }

      return snapshotWasAlreadyProcessed || replacedHashesWereAlreadyProcessed
    },
    async markSnapshotProcessed(hash: string): Promise<void> {
      await saveProcessedSnapshot(components.database, hash, Math.floor(Date.now() / 1000))
      logger.info(`Snapshot ${hash} successfully processed and saved.`)
    }
  }
}
