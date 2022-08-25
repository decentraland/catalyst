import { AuthChain, Authenticator } from '@dcl/crypto'
import { ContentMapping, DeploymentWithAuthChain, Entity, EntityType } from '@dcl/schemas'
import pg from 'pg'
import SQL, { SQLStatement } from 'sql-template-strings'
import { AuditInfo, DeploymentFilters, DeploymentSorting, SortingField, SortingOrder } from '../../service/deployments/types'
import { AppComponents } from '../../types'

export type HistoricalDeployment = DeploymentWithAuthChain & {
  deploymentId: number
  entityTimestamp: number
  metadata: any
  deployerAddress: string
  version: string
  overwrittenBy?: string
}

export interface HistoricalDeploymentsRow {
  id: number
  deployer_address: string
  version: string
  entity_type: EntityType
  entity_id: string
  entity_metadata: any
  entity_timestamp: number
  entity_pointers: string[]
  local_timestamp: number
  auth_chain: AuthChain
  deleter_deployment: number

  overwritten_by?: string
}

export async function deploymentExists(
  components: Pick<AppComponents, 'database'>,
  entityId: string
): Promise<boolean> {
  const { database } = components

  const result = await database.queryWithValues(SQL`
    SELECT 1
    FROM deployments
    WHERE entity_id = ${entityId}
  `, 'deployment_exists')

  return result.rowCount > 0
}

export async function* streamAllEntityIds(
  components: Pick<AppComponents, 'database'>
): AsyncIterable<{ entityId: string }> {
  const { database } = components

  for await (const row of database.streamQuery(
    SQL`
      SELECT entity_id FROM deployments
    `,
    { batchSize: 10000 },
    'stream_all_entities'
  )) {
    yield {
      entityId: row.entity_id
    }
  }
}

export function getHistoricalDeploymentsQuery(
  offset: number,
  limit: number,
  filters?: DeploymentFilters,
  sortBy?: DeploymentSorting,
  lastId?: string
): SQLStatement {
  const sorting = Object.assign({ field: SortingField.LOCAL_TIMESTAMP, order: SortingOrder.DESCENDING }, sortBy)

  const timestampField: string = sorting.field
  const order: string = sorting.order

  // Generate the select according the info needed
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
              FROM deployments AS dep1`

  const whereClause: SQLStatement[] = []
  // Configure sort and order
  configureSortWhereClause(order, timestampField, filters, lastId, whereClause)

  if (filters?.entityTypes && filters.entityTypes.length > 0) {
    const entityTypes = filters.entityTypes
    whereClause.push(SQL`dep1.entity_type = ANY (${entityTypes})`)
  }

  if (filters?.entityIds && filters.entityIds.length > 0) {
    const entityIds = filters.entityIds
    whereClause.push(SQL`dep1.entity_id = ANY (${entityIds})`)
  }

  if (filters?.onlyCurrentlyPointed) {
    whereClause.push(SQL`dep1.deleter_deployment IS NULL`)
  }

  if (filters?.pointers && filters.pointers.length > 0) {
    const pointers = filters.pointers.map((p) => p.toLowerCase())
    whereClause.push(SQL`dep1.entity_pointers && ${pointers}`)
  }

  let where = SQL``
  if (whereClause.length > 0) {
    where = SQL` WHERE `.append(whereClause[0])
    for (const condition of whereClause.slice(1)) {
      where = where.append(' AND ').append(condition)
    }
  }

  query.append(where)
  query
    .append(` ORDER BY dep1.`)
    .append(pg.Client.prototype.escapeIdentifier(timestampField))
    .append(` ${order}, LOWER(dep1.entity_id) ${order} `) // raw values need to be strings not sql templates
    .append(SQL`LIMIT ${limit} OFFSET ${offset}`)

  return query
}

/**  The lastId is a field that we only want to compare with when paginating.
 * If the filter specifies a timestamp value that it's repeated among many deployments,
 * then to know where the page should start we will use the lastId.
 */
function configureSortWhereClause(
  order: string,
  timestampField: string,
  filters: DeploymentFilters | undefined,
  lastId: string | undefined,
  whereClause: SQLStatement[]
) {
  const pageBorder: string =
    (order === SortingOrder.ASCENDING ? 'from' : 'to') +
    (timestampField === SortingField.ENTITY_TIMESTAMP ? 'EntityTimestamp' : 'LocalTimestamp')

  if (filters?.from && timestampField == SortingField.LOCAL_TIMESTAMP) {
    const fromLocalTimestamp = filters.from
    if (pageBorder == 'fromLocalTimestamp' && lastId) {
      whereClause.push(createOrClause('local_timestamp', '>', fromLocalTimestamp, lastId))
    } else {
      whereClause.push(SQL`dep1.local_timestamp >= to_timestamp(${fromLocalTimestamp} / 1000.0)`)
    }
  }
  if (filters?.to && timestampField == SortingField.LOCAL_TIMESTAMP) {
    const toLocalTimestamp = filters.to
    if (pageBorder == 'toLocalTimestamp' && lastId) {
      whereClause.push(createOrClause('local_timestamp', '<', toLocalTimestamp, lastId))
    } else {
      whereClause.push(SQL`dep1.local_timestamp <= to_timestamp(${toLocalTimestamp} / 1000.0)`)
    }
  }

  if (filters?.from && timestampField == SortingField.ENTITY_TIMESTAMP) {
    const fromEntityTimestamp = filters.from
    if (pageBorder == 'fromEntityTimestamp' && lastId) {
      whereClause.push(createOrClause('entity_timestamp', '>', fromEntityTimestamp, lastId))
    } else {
      whereClause.push(SQL`dep1.entity_timestamp >= to_timestamp(${fromEntityTimestamp} / 1000.0)`)
    }
  }
  if (filters?.to && timestampField == SortingField.ENTITY_TIMESTAMP) {
    const toEntityTimestamp = filters.to
    if (pageBorder == 'toEntityTimestamp' && lastId) {
      whereClause.push(createOrClause('entity_timestamp', '<', toEntityTimestamp, lastId))
    } else {
      whereClause.push(SQL`dep1.entity_timestamp <= to_timestamp(${toEntityTimestamp} / 1000.0)`)
    }
  }
}

export async function getHistoricalDeployments(
  components: Pick<AppComponents, 'database' | 'metrics'>,
  offset: number,
  limit: number,
  filters?: DeploymentFilters,
  sortBy?: DeploymentSorting,
  lastId?: string
): Promise<HistoricalDeployment[]> {
  const query = getHistoricalDeploymentsQuery(offset, limit, filters, sortBy, lastId)

  const historicalDeploymentsResponse = await components.database.queryWithValues(query, 'get_historical_deployments')

  const historicalDeployments: HistoricalDeployment[] = historicalDeploymentsResponse.rows.map(
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

  return historicalDeployments
}

/**
 * Beware that neither timestampField, compare, nor timestampFilter come directly from the user, this function does not sanitize their value
 */
export function createOrClause(
  timestampField: string,
  compare: string,
  timestamp: number,
  lastId: string
): SQLStatement {
  const entityIdEquality = SQL`(LOWER(dep1.entity_id) `.append(compare).append(SQL` LOWER(${lastId})`)
  const equalWithEntityIdComparison = entityIdEquality
    .append(` AND dep1.${pg.Client.prototype.escapeIdentifier(timestampField)}`)
    .append(SQL` = to_timestamp(${timestamp} / 1000.0))`)
  const timestampComparison = SQL`(dep1.`
    .append(`${pg.Client.prototype.escapeIdentifier(timestampField)}`)
    .append(` ${compare}`) // raw values need to be strings not sql templates
    .append(SQL` to_timestamp(${timestamp} / 1000.0))`)
  return SQL`(`.append(equalWithEntityIdComparison).append(' OR ').append(timestampComparison).append(')')
}

export async function getActiveDeploymentsByContentHash(
  components: Pick<AppComponents, 'database'>,
  contentHash: string
): Promise<string[]> {
  const query = SQL`SELECT deployment.entity_id FROM deployments as deployment INNER JOIN content_files ON content_files.deployment=deployment.id
    WHERE content_hash=${contentHash} AND deployment.deleter_deployment IS NULL;`

  const queryResult = (await components.database.queryWithValues(query, 'active_deployments_by_hash')).rows

  const entities = queryResult.map((deployment: { entity_id: string }) => deployment.entity_id)

  return entities
}

export async function getEntityById(components: Pick<AppComponents, 'database'>, entityId: string):
  Promise<{ entityId: string; localTimestamp: number } | undefined> {
  const queryResult = await components.database.queryWithValues<{ entityId: string, localTimestamp: number }>(SQL`
    SELECT
      entity_id AS "entityId",
      date_part('epoch', d.local_timestamp) * 1000 AS "localTimestamp"
    FROM deployments d WHERE entity_id = ${entityId}
    LIMIT 1
  `, 'entity_by_id')

  if (queryResult && queryResult.rowCount > 0) {
    return queryResult.rows[0]
  }
  return undefined
}

type DeploymentId = number

export async function saveDeployment(
  components: Pick<AppComponents, 'database'>,
  entity: Entity,
  auditInfo: AuditInfo,
  overwrittenBy: DeploymentId | null):
  Promise<DeploymentId> {
  const deployer = Authenticator.ownerAddress(auditInfo.authChain)
  const metadata = entity.metadata ? { v: entity.metadata } : null // We want to be able to store whatever we want, but psql is heavily typed. So we will wrap the metadata with an object
  const query = SQL`INSERT INTO deployments
  (deployer_address, version, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata, local_timestamp, auth_chain, deleter_deployment)
  VALUES
  (${deployer}, ${entity.version}, ${entity.type}, ${entity.id}, to_timestamp(${entity.timestamp} / 1000.0), ${entity.pointers}, ${metadata}, to_timestamp(${auditInfo.localTimestamp} / 1000.0), ${JSON.stringify(auditInfo.authChain)}, ${overwrittenBy})
  RETURNING id`
  const queryResult = await components.database.queryWithValues<{ id: number }>(query, 'save_deployment')
  return queryResult.rows[0].id
}

export async function saveContentFiles(
  components: Pick<AppComponents, 'database'>,
  deploymentId: DeploymentId,
  content: ContentMapping[]): Promise<void> {
  const queries = content.map((item) =>
    SQL`INSERT INTO content_files (deployment, key, content_hash) VALUES (${deploymentId}, ${item.file}, ${item.hash})`)
  return components.database.transactionQuery(queries, 'save_content_files')
}

export async function getDeployments(
  components: Pick<AppComponents, 'database'>,
  deploymentIds: Set<number>): Promise<{ id: number; pointers: string[] }[]> {
  if (deploymentIds.size === 0) return []
  const query = SQL`SELECT id, entity_pointers as pointers FROM deployments WHERE id IN (`
  const ids = Array.from(deploymentIds)
    .map((id, idx) => (idx < deploymentIds.size - 1) ? SQL`${id},` : SQL`${id}`)
  ids.forEach((id) => query.append(id))
  query.append(`);`)
  const queryResult = await components.database.queryWithValues<{ id: number, pointers: string[] }>(query, 'get_deployments')
  return queryResult.rows
}
