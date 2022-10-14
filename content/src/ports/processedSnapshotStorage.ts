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

  async function saveSnapshotAndDeleteTheReplacedOnes(snapshotHash: string, replacedSnapshotHashes?: string[]) {
    await components.database.transaction(async (txDatabase) => {
      await deleteProcessedSnapshots(txDatabase, replacedSnapshotHashes ?? [])
      await saveProcessedSnapshot(txDatabase, snapshotHash, Date.now())
    }, 'replace_processed_snapshots')
  }

  return {
    async wasSnapshotProcessed(hash: string, replacedSnapshotHashes?: string[]): Promise<boolean> {
      const replacedHashes = replacedSnapshotHashes ?? []
      const processedSnapshotHashes = await getProcessedSnapshots(components, [hash, ...replacedHashes])

      const snapshotWasAlreadyProcessed = processedSnapshotHashes.has(hash)
      const replacedHashesWereAlreadyProcessed =
        replacedHashes.length > 0 && replacedHashes.every((h) => processedSnapshotHashes.has(h))

      if (!snapshotWasAlreadyProcessed && replacedHashesWereAlreadyProcessed) {
        await saveSnapshotAndDeleteTheReplacedOnes(hash, replacedHashes)
      }

      return snapshotWasAlreadyProcessed || replacedHashesWereAlreadyProcessed
    },
    async markSnapshotProcessed(hash: string, replacedSnapshotHashes?: string[]): Promise<void> {
      await saveSnapshotAndDeleteTheReplacedOnes(hash, replacedSnapshotHashes)
      logger.info(`Snapshot ${hash} successfully processed and saved.`)
    }
  }
}
