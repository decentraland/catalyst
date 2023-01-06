import { hasSnapshot } from '../logic/database-queries/snapshots-queries'
import { AppComponents } from '../types'

export function createSnapshotStorage(components: Pick<AppComponents, 'database'>) {
  return {
    async has(snapshotHash: string) {
      return hasSnapshot(components, snapshotHash)
    }
  }
}
