import { AppComponents } from '../../types'
import { SnapshotStorage } from './types'

export function createSnapshotStorage(
  components: Pick<AppComponents, 'database' | 'snapshotsRepository'>
): SnapshotStorage {
  const { database, snapshotsRepository } = components

  return {
    async has(snapshotHash: string) {
      return snapshotsRepository.isOwnSnapshot(database, snapshotHash)
    }
  }
}
