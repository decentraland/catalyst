import {
  DeploymentFilters,
  DeploymentSorting,
  EntityId,
  EntityType,
  EntityVersion,
  Pointer,
  SortingField,
  SortingOrder,
  Timestamp
} from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import pg from 'pg'
import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents } from '../../types'

export interface HistoricalDeployment {
  deploymentId: number
  entityType: EntityType
  entityId: EntityId
  pointers: Pointer[]
  entityTimestamp: Timestamp
  metadata: any
  deployerAddress: string
  version: EntityVersion
  authChain: AuthChain
  localTimestamp: Timestamp
  overwrittenBy: string | undefined
}

export interface HistoricalDeploymentsRow {
  id: number
  deployer_address: string
  version: EntityVersion
  entity_type: EntityType
  entity_id: EntityId
  entity_metadata: any
  entity_timestamp: Timestamp
  entity_pointers: Pointer[]
  local_timestamp: Timestamp
  auth_chain: AuthChain
  overwritten_by: EntityId | undefined
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
  `)

  return result.rowCount > 0
}

export async function* streamAllEntityIds(
  components: Pick<AppComponents, 'database'>
): AsyncGenerator<{ entityId: any }, void, unknown> {
  const { database } = components

  for await (const row of database.streamQuery(
    SQL`
      SELECT entity_id FROM deployments
    `,
    { batchSize: 10000 }
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
                  dep.id,
                  dep.entity_type,
                  dep.entity_id,
                  dep.entity_pointers,
                  date_part('epoch', dep.entity_timestamp) * 1000 AS entity_timestamp,
                  dep.entity_metadata,
                  dep.deployer_address,
                  dep.version,
                  dep.auth_chain,
                  date_part('epoch', dep.local_timestamp) * 1000 AS local_timestamp,
                  dep.overwritten_by
              FROM deployments AS dep`

  const whereClause: SQLStatement[] = []
  // Configure sort and order
  configureSortWhereClause(order, timestampField, filters, lastId, whereClause)

  if (filters?.entityTypes && filters.entityTypes.length > 0) {
    const entityTypes = filters.entityTypes
    whereClause.push(SQL`dep.entity_type = ANY (${entityTypes})`)
  }

  if (filters?.entityIds && filters.entityIds.length > 0) {
    const entityIds = filters.entityIds
    whereClause.push(SQL`dep.entity_id = ANY (${entityIds})`)
  }

  if (filters?.onlyCurrentlyPointed) {
    whereClause.push(SQL`dep.overwritten_by IS NULL`)
  }

  if (filters?.pointers && filters.pointers.length > 0) {
    const pointers = filters.pointers.map((p) => p.toLowerCase())
    whereClause.push(SQL`dep.entity_pointers && ${pointers}`)
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
    .append(` ORDER BY dep.`)
    .append(pg.Client.prototype.escapeIdentifier(timestampField))
    .append(` ${order}, LOWER(dep.entity_id) ${order} `) // raw values need to be strings not sql templates
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
      whereClause.push(SQL`dep.local_timestamp >= to_timestamp(${fromLocalTimestamp} / 1000.0)`)
    }
  }
  if (filters?.to && timestampField == SortingField.LOCAL_TIMESTAMP) {
    const toLocalTimestamp = filters.to
    if (pageBorder == 'toLocalTimestamp' && lastId) {
      whereClause.push(createOrClause('local_timestamp', '<', toLocalTimestamp, lastId))
    } else {
      whereClause.push(SQL`dep.local_timestamp <= to_timestamp(${toLocalTimestamp} / 1000.0)`)
    }
  }

  if (filters?.from && timestampField == SortingField.ENTITY_TIMESTAMP) {
    const fromEntityTimestamp = filters.from
    if (pageBorder == 'fromEntityTimestamp' && lastId) {
      whereClause.push(createOrClause('entity_timestamp', '>', fromEntityTimestamp, lastId))
    } else {
      whereClause.push(SQL`dep.entity_timestamp >= to_timestamp(${fromEntityTimestamp} / 1000.0)`)
    }
  }
  if (filters?.to && timestampField == SortingField.ENTITY_TIMESTAMP) {
    const toEntityTimestamp = filters.to
    if (pageBorder == 'toEntityTimestamp' && lastId) {
      whereClause.push(createOrClause('entity_timestamp', '<', toEntityTimestamp, lastId))
    } else {
      whereClause.push(SQL`dep.entity_timestamp <= to_timestamp(${toEntityTimestamp} / 1000.0)`)
    }
  }
}

export async function getHistoricalDeployments(
  components: Pick<AppComponents, 'database'>,
  offset: number,
  limit: number,
  filters?: DeploymentFilters,
  sortBy?: DeploymentSorting,
  lastId?: string
): Promise<HistoricalDeployment[]> {
  const query = getHistoricalDeploymentsQuery(offset, limit, filters, sortBy, lastId)

  const historicalDeploymentsResponse = await components.database.queryWithValues(query)

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
  const entityIdEquality = SQL`(LOWER(dep.entity_id) `.append(compare).append(SQL` LOWER(${lastId})`)
  const equalWithEntityIdComparison = entityIdEquality
    .append(` AND dep.${pg.Client.prototype.escapeIdentifier(timestampField)}`)
    .append(SQL` = to_timestamp(${timestamp} / 1000.0))`)
  const timestampComparison = SQL`(dep.`
    .append(`${pg.Client.prototype.escapeIdentifier(timestampField)}`)
    .append(` ${compare}`) // raw values need to be strings not sql templates
    .append(SQL` to_timestamp(${timestamp} / 1000.0))`)
  return SQL`(`.append(equalWithEntityIdComparison).append(' OR ').append(timestampComparison).append(')')
}

export async function getActiveDeploymentsByContentHash(
  components: Pick<AppComponents, 'database'>,
  contentHash: string
): Promise<EntityId[]> {
  const query = SQL`SELECT deployment.entity_id FROM deployments as deployment
    INNER JOIN content_files ON content_files.deployment=deployment.id
    WHERE content_hash=${contentHash} AND deployment.overwritten_by IS NULL;`

  const queryResult = (await components.database.queryWithValues(query)).rows

  const entities = queryResult.map((deployment: { entity_id: EntityId }) => deployment.entity_id)

  return entities
}
