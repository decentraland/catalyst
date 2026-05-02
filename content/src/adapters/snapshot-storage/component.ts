import { isOwnSnapshot } from '../snapshots-repository'
import { AppComponents } from '../../types'
import { SnapshotStorage } from './types'

export function createSnapshotStorage(components: Pick<AppComponents, 'database'>): SnapshotStorage {
  const { database } = components

  return {
    async has(snapshotHash: string) {
      return isOwnSnapshot(database, snapshotHash)
    }
  }
}
