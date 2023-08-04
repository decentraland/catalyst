import { isOwnSnapshot } from '../logic/database-queries/snapshots-queries.js'
import { AppComponents } from '../types.js'

export function createSnapshotStorage(components: Pick<AppComponents, 'database'>) {
  return {
    async has(snapshotHash: string) {
      return isOwnSnapshot(components.database, snapshotHash)
    }
  }
}
