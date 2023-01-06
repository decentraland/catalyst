import { isOwnSnapshot } from '../logic/database-queries/snapshots-queries'
import { AppComponents } from '../types'

export function createSnapshotStorage(components: Pick<AppComponents, 'database'>) {
  return {
    async has(snapshotHash: string) {
      return isOwnSnapshot(components, snapshotHash)
    }
  }
}
