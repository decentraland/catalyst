import { Entity, EntityType } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import SQL, { SQLStatement } from 'sql-template-strings'
import {
  AuditInfo,
  Deployment,
  DeploymentContext,
  DeploymentOptions,
  PartialDeploymentHistory
} from '../deployment-types'
import { FailedDeployment } from '../ports/failedDeployments'
import { DatabaseClient, DatabaseTransactionalClient } from '../ports/postgres'
import { deployEntityFromRemoteServer } from '../service/synchronization/deployRemoteEntity'
import { IGNORING_FIX_ERROR } from '../service/validations/server'
import { AppComponents, DeploymentId, EntityVersion } from '../types'
import { getContentFiles } from './database-queries/content-files-queries'
import {
  calculateOverwrittenByManyFast,
  calculateOverwrittenBySlow,
  calculateOverwrote,
  deploymentExists,
  getHistoricalDeployments,
  HistoricalDeployment,
  HistoricalDeploymentsRow,
  saveContentFiles,
  saveDeployment
} from './database-queries/deployments-queries'

export async function isEntityDeployed(
  database: DatabaseClient,
  components: Pick<AppComponents, 'deployedEntitiesBloomFilter' | 'metrics'>,
  entityId: string,
  entityTimestamp: number
): Promise<boolean> {
  // this condition should be carefully handled:
  // 1) it first uses the bloom filter to know wheter or not an entity may exist or definitely don't exist (.check)
  // 2) then it checks against the DB (deploymentExists)
  if (await components.deployedEntitiesBloomFilter.isProbablyDeployed(entityId, entityTimestamp)) {
    if (await deploymentExists(database, entityId)) {
      components.metrics.increment('dcl_deployed_entities_bloom_filter_checks_total', { hit: 'true' })
      return true
    } else {
      components.metrics.increment('dcl_deployed_entities_bloom_filter_checks_total', { hit: 'false' })
      return false
    }
  } else {
    components.metrics.increment('dcl_deployed_entities_bloom_filter_checks_total', { hit: 'true' })
    return false
  }
}

export async function retryFailedDeploymentExecution(
  components: Pick<
    AppComponents,
    | 'metrics'
    | 'staticConfigs'
    | 'fetcher'
    | 'downloadQueue'
    | 'logs'
    | 'deployer'
    | 'contentCluster'
    | 'failedDeployments'
    | 'storage'
  >,
  logger?: ILoggerComponent.ILogger
): Promise<void> {
  const logs = logger || components.logs.getLogger('retryFailedDeploymentExecution')
  // Get Failed Deployments from local storage
  const failedDeployments: FailedDeployment[] = await components.failedDeployments.getAllFailedDeployments()

  // TODO: there may be chances that failed deployments are not part of all catalyst in cluster
  const contentServersUrls = components.contentCluster.getAllServersInCluster()

  // TODO: Implement an exponential backoff for retrying
  for (const failedDeployment of failedDeployments) {
    // Build Deployment from other servers
    const { entityId, entityType, authChain } = failedDeployment

    if (authChain) {
      logs.debug(`Will retry to deploy entity`, { entityId, entityType })
      try {
        await deployEntityFromRemoteServer(
          components,
          entityId,
          entityType,
          authChain,
          contentServersUrls,
          DeploymentContext.FIX_ATTEMPT
        )
      } catch (error) {
        // it failed again, override failed deployment error description
        const errorDescription = error.message + ''

        if (!errorDescription.includes(IGNORING_FIX_ERROR)) {
          await components.failedDeployments.reportFailure({ ...failedDeployment, errorDescription })
        }

        logs.error(`Failed to fix deployment of entity`, { entityId, entityType, errorDescription })
        logs.error(error)
      }
    } else {
      logs.info(`Can't retry failed deployment. Because it lacks of authChain`, { entityId, entityType })
    }
  }
}

export function mapDeploymentsToEntities(deployments: Deployment[]): Entity[] {
  return deployments.map(({ entityVersion, entityId, entityType, pointers, entityTimestamp, content, metadata }) => ({
    version: entityVersion,
    id: entityId,
    type: entityType,
    pointers,
    timestamp: entityTimestamp,
    content: content?.map(({ key, hash }) => ({ file: key, hash })) || [],
    metadata
  }))
}

export async function saveDeploymentAndContentFiles(
  database: DatabaseTransactionalClient,
  entity: Entity,
  auditInfo: AuditInfo,
  overwrittenBy: DeploymentId | null
) {
  const deploymentId = await saveDeployment(database, entity, auditInfo, overwrittenBy)
  if (entity.content) {
    await saveContentFiles(database, deploymentId, entity.content)
  }
  return deploymentId
}

export async function calculateOverwrites(
  database: DatabaseClient,
  entity: Entity
): Promise<{ overwrote: Set<DeploymentId>; overwrittenBy: DeploymentId | null }> {
  const overwrote = await calculateOverwrote(database, entity)

  let overwrittenByMany = await calculateOverwrittenByManyFast(database, entity)

  if (overwrittenByMany.length === 0 && entity.type === 'scene') {
    // Scene overwrite determination can be tricky. If none was detected use this other query (slower but safer)
    overwrittenByMany = await calculateOverwrittenBySlow(database, entity)
  }

  let overwrittenBy: DeploymentId | null = null
  if (overwrittenByMany.length > 0) {
    overwrittenBy = overwrittenByMany[0].id
  }
  return {
    overwrote: new Set(overwrote),
    overwrittenBy
  }
}

export const MAX_HISTORY_LIMIT = 500

export function getCuratedOffset(options?: DeploymentOptions): number {
  return options?.offset && options.offset >= 0 ? options.offset : 0
}
export function getCuratedLimit(options?: DeploymentOptions): number {
  return options?.limit && options.limit > 0 && options.limit <= MAX_HISTORY_LIMIT ? options.limit : MAX_HISTORY_LIMIT
}

export async function getDeployments(
  components: Pick<AppComponents, 'denylist' | 'metrics'>,
  database: DatabaseClient,
  options?: DeploymentOptions
): Promise<PartialDeploymentHistory<Deployment>> {
  const curatedOffset = getCuratedOffset(options)
  const curatedLimit = getCuratedLimit(options)

  const deploymentsWithExtra = await getHistoricalDeployments(
    database,
    curatedOffset,
    curatedLimit + 1,
    options?.filters,
    options?.sortBy,
    options?.lastId
  )

  const moreData = deploymentsWithExtra.length > curatedLimit

  let deploymentsResult = deploymentsWithExtra.slice(0, curatedLimit)

  const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)

  const content = await getContentFiles(database, deploymentIds)

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
  database: DatabaseClient,
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

  const historicalDeploymentsResponse = await database.queryWithValues(query, 'get_active_entities')

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

  const content = await getContentFiles(database, deploymentIds)

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

export interface IDeploymentsComponent {
  getDeploymentsForActiveThirdPartyCollectionItems(thirdPartyCollectionUrn: string): Promise<Deployment[]>
  getDeploymentsForActiveThirdPartyCollectionItemsByEntityIds(entityIds: string[]): Promise<Deployment[]>
  updateMaterializedViews(): Promise<void>
}

export const createDeploymentsComponent = (components: Pick<AppComponents, 'database'>): IDeploymentsComponent => {
  const { database } = components

  // TODO: cantidate to be removed
  async function getDeploymentsForActiveThirdPartyCollectionItems(
    thirdPartyCollectionUrn: string
  ): Promise<Deployment[]> {
    const query = SQL`
      SELECT
      id,
      entity_type,
      entity_id,
      entity_pointers,
      entity_timestamp,
      entity_metadata,
      deployer_address,
      version,
      auth_chain,
      local_timestamp,
      content_hashes,
      content_keys
      FROM active_third_party_collection_items_deployments_with_content
      WHERE pointer LIKE '${thirdPartyCollectionUrn}:%';
    `
    const deployments = await database.queryWithValues<
      HistoricalDeploymentsRow & { content_keys: string[]; content_hashes: string[] }
    >(query, 'get_deployments_for_active_third_party_collection_items')
    return deployments.rows.map(
      (row: HistoricalDeploymentsRow & { content_keys: string[]; content_hashes: string[] }): Deployment => ({
        entityVersion: row.version as EntityVersion,
        entityType: row.entity_type as EntityType,
        entityId: row.entity_id,
        pointers: row.entity_pointers,
        entityTimestamp: row.entity_timestamp,
        content: row.content_keys.map((content_key, index) => ({ key: content_key, hash: row.content_hashes[index] })),
        metadata: row.entity_metadata ? row.entity_metadata.v : undefined,
        deployedBy: row.deployer_address,
        auditInfo: {
          version: row.version as EntityVersion,
          authChain: row.auth_chain,
          localTimestamp: row.local_timestamp,
          overwrittenBy: row.overwritten_by
        }
      })
    )
  }

  async function getDeploymentsForActiveThirdPartyCollectionItemsByEntityIds(
    entityIds: string[]
  ): Promise<Deployment[]> {
    const query = SQL`
      SELECT * FROM active_third_party_collection_items_deployments_with_content
      WHERE entity_id = ANY(${entityIds});
    `
    const deployments = await database.queryWithValues<
      HistoricalDeploymentsRow & { content_keys: string[]; content_hashes: string[] }
    >(query, 'get_deployments_for_active_third_party_collection_items_by_entity_ids')
    return deployments.rows.map(
      (row: HistoricalDeploymentsRow & { content_keys: string[]; content_hashes: string[] }): Deployment => ({
        entityVersion: row.version as EntityVersion,
        entityType: row.entity_type as EntityType,
        entityId: row.entity_id,
        pointers: row.entity_pointers,
        entityTimestamp: row.entity_timestamp,
        content: row.content_keys.map((content_key, index) => ({ key: content_key, hash: row.content_hashes[index] })),
        metadata: row.entity_metadata,
        deployedBy: row.deployer_address,
        auditInfo: {
          version: row.version as EntityVersion,
          authChain: row.auth_chain,
          localTimestamp: row.local_timestamp,
          overwrittenBy: row.overwritten_by
        }
      })
    )
  }

  async function updateMaterializedViews(): Promise<void> {
    await database.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY active_third_party_collection_items_deployments_with_content'
    )
  }

  return {
    getDeploymentsForActiveThirdPartyCollectionItems,
    getDeploymentsForActiveThirdPartyCollectionItemsByEntityIds,
    updateMaterializedViews
  }
}
