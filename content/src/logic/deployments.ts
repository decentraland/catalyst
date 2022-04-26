import { ILoggerComponent } from '@well-known-components/interfaces'
import { Deployment, Entity } from 'dcl-catalyst-commons'
import { FailedDeployment } from '../ports/failedDeploymentsCache'
import { DeploymentContext } from '../service/Service'
import { deployEntityFromRemoteServer } from '../service/synchronization/deployRemoteEntity'
import { IGNORING_FIX_ERROR } from '../service/validations/server'
import { AppComponents } from '../types'
import { deploymentExists } from './database-queries/deployments-queries'

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
    content: content?.map(({ key, hash }) => ({ file: key, hash })),
    metadata
  }))
}
