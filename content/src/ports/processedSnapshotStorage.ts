import { IProcessedSnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import { existsProcessedSnapshot, saveProcessedSnapshot } from '../logic/database-queries/snapshots-queries'
import { AppComponents } from '../types'

export function createProcessedSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'logs'>
): IProcessedSnapshotStorageComponent {
  const logger = components.logs.getLogger('snapshot-process-end-task')
  return {
    async wasSnapshotProcessed(hash: string): Promise<boolean> {
      return existsProcessedSnapshot(components, hash)
    },
    async markSnapshotProcessed(hash: string): Promise<void> {
      await saveProcessedSnapshot(components, hash, Math.floor(Date.now() / 1000))
      logger.info(`Snapshot ${hash} successfully processed and saved.`)
    }
  }
}
