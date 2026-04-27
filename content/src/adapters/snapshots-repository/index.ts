export {
  createSnapshotsRepository,
  streamActiveDeploymentsInTimeRange,
  findSnapshotsStrictlyContainedInTimeRange,
  saveSnapshot,
  isOwnSnapshot,
  getSnapshotHashesNotInTimeRange,
  deleteSnapshotsInTimeRange,
  snapshotIsOutdated,
  getNumberOfActiveEntitiesInTimeRange,
  saveProcessedSnapshot,
  getProcessedSnapshots,
  getAllSnapshotHashes
} from './component'
export type { ISnapshotsRepository } from './types'
