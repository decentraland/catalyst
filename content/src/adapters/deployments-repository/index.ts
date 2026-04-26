export {
  createDeploymentsRepository,
  deploymentExists,
  streamAllEntityIdsInTimeRange,
  streamAllDistinctEntityIds,
  getHistoricalDeployments,
  getHistoricalDeploymentsQuery,
  getActiveDeploymentsByContentHash,
  getEntityById,
  saveDeployment,
  getDeployments,
  setEntitiesAsOverwritten,
  calculateOverwrote,
  calculateOverwrittenByManyFast,
  calculateOverwrittenBySlow,
  createOrClause
} from './component'
export type { IDeploymentsRepository, HistoricalDeployment, HistoricalDeploymentsRow, MigrationDataRow } from './types'
