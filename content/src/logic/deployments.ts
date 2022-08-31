import { Entity } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { FailedDeployment } from '../ports/failedDeploymentsCache'
import { IDatabaseComponent } from '../ports/postgres'
import { AuditInfo, Deployment } from '../service/deployments/types'
import { DeploymentContext } from '../service/Service'
import { deployEntityFromRemoteServer } from '../service/synchronization/deployRemoteEntity'
import { IGNORING_FIX_ERROR } from '../service/validations/server'
import { AppComponents, DeploymentId } from '../types'
import {
  calculateOverwrittenByManyFast,
  calculateOverwrittenBySlow,
  calculateOverwrote,
  deploymentExists,
  saveContentFiles,
  saveDeployment
} from './database-queries/deployments-queries'

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

export async function saveDeploymentAndContentFiles(
  database: IDatabaseComponent,
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
  database: IDatabaseComponent,
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
