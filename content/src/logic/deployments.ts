import { Entity } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import SQL from 'sql-template-strings'
import { FailedDeployment } from '../ports/failedDeploymentsCache'
import { AuditInfo, Deployment } from '../service/deployments/types'
import { DeploymentContext } from '../service/Service'
import { deployEntityFromRemoteServer } from '../service/synchronization/deployRemoteEntity'
import { IGNORING_FIX_ERROR } from '../service/validations/server'
import { AppComponents } from '../types'
import { deploymentExists, saveContentFiles, saveDeployment } from './database-queries/deployments-queries'

export async function isEntityDeployed(
  components: Pick<AppComponents, 'deployedEntitiesBloomFilter' | 'database' | 'metrics'>,
  entityId: string
): Promise<boolean> {
  // this condition should be carefully handled:
  // 1) it first uses the bloom filter to know wheter or not an entity may exist or definitely don't exist (.check)
  // 2) then it checks against the DB (deploymentExists)
  if (await components.deployedEntitiesBloomFilter.check(entityId)) {
    if (await deploymentExists(components, entityId)) {
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
    | 'failedDeploymentsCache'
    | 'storage'
  >,
  logger?: ILoggerComponent.ILogger
): Promise<void> {
  const logs = logger || components.logs.getLogger('retryFailedDeploymentExecution')
  // Get Failed Deployments from local storage
  const failedDeployments: FailedDeployment[] = components.deployer.getAllFailedDeployments()

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
          components.failedDeploymentsCache.reportFailure({ ...failedDeployment, errorDescription })
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


type DeploymentId = number

export async function saveDeploymentAndContentFiles(
  components: Pick<AppComponents, 'database'>,
  entity: Entity,
  auditInfo: AuditInfo,
  overwrittenBy: DeploymentId | null
) {
  const deploymentId = await saveDeployment(components, entity, auditInfo, overwrittenBy)
  if (entity.content) {
    await saveContentFiles(components, deploymentId, entity.content)
  }
  return deploymentId
}

export async function calculateOverwrites(
  components: Pick<AppComponents, 'database' | 'repository'>,
  entity: Entity
): Promise<{ overwrote: Set<DeploymentId>; overwrittenBy: DeploymentId | null }> {
  const overwrote: DeploymentId[] = (await components.database.queryWithValues<{ id: number }>(
    SQL`
          SELECT dep1.id
          FROM deployments AS dep1
          LEFT JOIN deployments AS dep2 ON dep1.deleter_deployment = dep2.id
          WHERE dep1.entity_type = ${entity.type} AND
              dep1.entity_pointers && ${entity.pointers} AND
              (dep1.entity_timestamp < to_timestamp(${entity.timestamp} / 1000.0) OR (dep1.entity_timestamp = to_timestamp(${entity.timestamp} / 1000.0) AND dep1.entity_id < ${entity.id})) AND
              (dep2.id IS NULL OR dep2.entity_timestamp > to_timestamp(${entity.timestamp} / 1000.0) OR (dep2.entity_timestamp = to_timestamp(${entity.timestamp} / 1000.0) AND dep2.entity_id > ${entity.id}))
          ORDER BY dep1.entity_timestamp DESC, dep1.entity_id DESC`
  )).rows.map((row) => row.id)

  const q = SQL`
  SELECT deployments.id
  FROM active_pointers as ap
           INNER JOIN deployments on ap.entity_id = deployments.entity_id
  WHERE ap.pointer IN (`
  const pointers = Array.from(entity.pointers)
    .map((pointer, idx) => (idx < entity.pointers.length - 1) ? SQL`${pointer},` : SQL`${pointer}`)
  pointers.forEach((pointer) => q.append(pointer))
  q.append(SQL`)
          AND deployments.entity_type = ${entity.type}
          AND (deployments.entity_timestamp > to_timestamp(${entity.timestamp} / 1000.0) OR (deployments.entity_timestamp = to_timestamp(${entity.timestamp} / 1000.0) AND deployments.entity_id > ${entity.id}))
        ORDER BY deployments.entity_timestamp, deployments.entity_id
        LIMIT 1`)
  let overwrittenByMany = (await components.database.queryWithValues<{ id: number }>(q)).rows

  if (overwrittenByMany.length === 0 && entity.type === 'scene') {
    // Scene overwrite determination can be tricky. If none was detected use this other query (slower but safer)
    overwrittenByMany = (await components.database.queryWithValues<{ id: number }>(
      SQL`
      SELECT deployments.id
      FROM deployments
      WHERE deployments.entity_type = ${entity.type} AND
          deployments.entity_pointers && ${entity.pointers} AND
          (deployments.entity_timestamp > to_timestamp(${entity.timestamp} / 1000.0) OR (deployments.entity_timestamp = to_timestamp(${entity.timestamp} / 1000.0) AND deployments.entity_id > ${entity.id}))
      ORDER BY deployments.entity_timestamp, deployments.entity_id
      LIMIT 1`
    )).rows
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
