import { isOwnSnapshot } from '../adapters/snapshots-repository'
import { AppComponents } from '../types'

export function createSnapshotStorage(components: Pick<AppComponents, 'database'>) {
  return {
    async has(snapshotHash: string) {
      return isOwnSnapshot(components.database, snapshotHash)
    }
  }
}
