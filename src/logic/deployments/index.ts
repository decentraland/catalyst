export {
  isEntityDeployed,
  retryFailedDeploymentExecution,
  mapDeploymentsToEntities,
  saveDeploymentAndContentFiles,
  calculateOverwrites,
  MAX_HISTORY_LIMIT,
  getCuratedOffset,
  getCuratedLimit,
  buildDeploymentFromHistoricalDeployment,
  buildHistoricalDeploymentsFromRow,
  getDeployments,
  getDeploymentsForActiveEntities,
  getPointerChanges,
  createDeploymentsComponent
} from './component'
// The row-shape types (MappableDeploymentRow, ThirdPartyItemDeploymentRow) are deliberately absent:
// they describe SQL result shapes this component consumes internally, not its public surface. The
// component and its tests import them from './types' directly.
export type { IDeploymentsComponent, DeploymentPointerChanges, PointerChangesFilters } from './types'
