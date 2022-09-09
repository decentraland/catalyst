import { getContentFiles } from '../../logic/database-queries/content-files-queries'
import {
  getHistoricalDeployments,
  HistoricalDeployment,
  HistoricalDeploymentsRow
} from '../../logic/database-queries/deployments-queries'
import { AppComponents, EntityVersion } from '../../types'
import { Deployment, DeploymentOptions, PartialDeploymentHistory } from './types'
import { EntityType } from '@dcl/schemas'
import SQL, { SQLStatement } from 'sql-template-strings'

export const MAX_HISTORY_LIMIT = 500

export function getCuratedOffset(options?: DeploymentOptions): number {
  return options?.offset && options.offset >= 0 ? options.offset : 0
}
export function getCuratedLimit(options?: DeploymentOptions): number {
  return options?.limit && options.limit > 0 && options.limit <= MAX_HISTORY_LIMIT ? options.limit : MAX_HISTORY_LIMIT
}

export async function getDeployments(
  components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
  options?: DeploymentOptions
): Promise<PartialDeploymentHistory<Deployment>> {
  const curatedOffset = getCuratedOffset(options)
  const curatedLimit = getCuratedLimit(options)

  const deploymentsWithExtra = await getHistoricalDeployments(
    components,
    curatedOffset,
    curatedLimit + 1,
    options?.filters,
    options?.sortBy,
    options?.lastId
  )

  const moreData = deploymentsWithExtra.length > curatedLimit

  let deploymentsResult = deploymentsWithExtra.slice(0, curatedLimit)

  const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)

  const content = await getContentFiles(components, deploymentIds)

  if (!options?.includeDenylisted) {
    deploymentsResult = deploymentsResult.filter((result) => !components.denylist.isDenylisted(result.entityId))
  }

  const deployments: Deployment[] = deploymentsResult.map((result) => ({
    entityVersion: result.version as EntityVersion,
    entityType: result.entityType as EntityType,
    entityId: result.entityId,
    pointers: result.pointers,
    entityTimestamp: result.entityTimestamp,
    content: content.get(result.deploymentId) || [],
    metadata: result.metadata,
    deployedBy: result.deployerAddress,
    auditInfo: {
      version: result.version as EntityVersion,
      authChain: result.authChain,
      localTimestamp: result.localTimestamp,
      overwrittenBy: result.overwrittenBy
    }
  }))

  return {
    deployments,
    filters: {
      ...options?.filters
    },
    pagination: {
      offset: curatedOffset,
      limit: curatedLimit,
      moreData: moreData,
      lastId: options?.lastId
    }
  }
}

export async function getDeploymentsForActiveEntities(
  components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
  entityIds?: string[],
  pointers?: string[]
): Promise<Deployment[]> {
  // Generate the select according the info needed
  const bothPresent = entityIds && entityIds.length > 0 && pointers && pointers.length > 0
  const nonePresent = !entityIds && !pointers
  if (bothPresent || nonePresent) {
    throw Error('in getDeploymentsForActiveEntities ids or pointers must be present, but not both')
  }

  const query: SQLStatement = SQL`
      SELECT
          dep1.id,
          dep1.entity_type,
          dep1.entity_id,
          dep1.entity_pointers,
          date_part('epoch', dep1.entity_timestamp) * 1000 AS entity_timestamp,
          dep1.entity_metadata,
          dep1.deployer_address,
          dep1.version,
          dep1.auth_chain,
          date_part('epoch', dep1.local_timestamp) * 1000 AS local_timestamp
      FROM deployments AS dep1
      WHERE dep1.deleter_deployment IS NULL
        AND `.append(
    entityIds
      ? SQL`dep1.entity_id = ANY (${entityIds})`
      : SQL`dep1.entity_pointers && ${pointers!.map((p) => p.toLowerCase())}`
  )

  const historicalDeploymentsResponse = await components.database.queryWithValues(query, 'get_active_entities')

  const deploymentsResult: HistoricalDeployment[] = historicalDeploymentsResponse.rows.map(
    (row: HistoricalDeploymentsRow): HistoricalDeployment => ({
      deploymentId: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      pointers: row.entity_pointers,
      entityTimestamp: row.entity_timestamp,
      metadata: row.entity_metadata ? row.entity_metadata.v : undefined,
      deployerAddress: row.deployer_address,
      version: row.version,
      authChain: row.auth_chain,
      localTimestamp: row.local_timestamp,
      overwrittenBy: row.overwritten_by ?? undefined
    })
  )

  const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)

  const content = await getContentFiles(components, deploymentIds)

  return deploymentsResult.map((result) => ({
    entityVersion: result.version as EntityVersion,
    entityType: result.entityType as EntityType,
    entityId: result.entityId,
    pointers: result.pointers,
    entityTimestamp: result.entityTimestamp,
    content: content.get(result.deploymentId) || [],
    metadata: result.metadata,
    deployedBy: result.deployerAddress,
    auditInfo: {
      version: result.version as EntityVersion,
      authChain: result.authChain,
      localTimestamp: result.localTimestamp,
      overwrittenBy: result.overwrittenBy
    }
  }))
}
