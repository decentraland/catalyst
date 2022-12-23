import { SnapshotSyncDeployment } from '@dcl/schemas'
import { IDeployerComponent } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { IBaseComponent } from '@well-known-components/interfaces'
import { isEntityDeployed } from '../../logic/deployments'
import { FailureReason } from '../../ports/failedDeployments'
import { AppComponents, CannonicalEntityDeployment } from '../../types'
import { DeploymentContext } from '../Service'
import { deployEntityFromRemoteServer } from './deployRemoteEntity'

/**
 * An IDeployerComponent parallelizes deployments with a JobQueue.
 * The JobQueue concurrency can be configured.
 * The IDeployerComponent has a map of deployments that may be cleared up every now and then.
 * It assumes deployments can be received more than twice, every operation is assumed idempotent.
 * The deployments with different servers will count as one while they appear in the internal data structure (the map).
 * For every entityId, the servers are added to a mutable array that can and should be used to load balance the downloads.
 */
export function createBatchDeployerComponent(
  components: Pick<
    AppComponents,
    | 'logs'
    | 'metrics'
    | 'fetcher'
    | 'deployer'
    | 'downloadQueue'
    | 'staticConfigs'
    | 'database'
    | 'deployedEntitiesBloomFilter'
    | 'storage'
    | 'failedDeployments'
    | 'clock'
  >,
  syncOptions: {
    ignoredTypes: Set<string>
    queueOptions: createJobQueue.Options
  }
): IDeployerComponent & IBaseComponent {
  const logs = components.logs.getLogger('DeployerComponent')

  const parallelDeploymentJobs = createJobQueue(syncOptions.queueOptions)

  // accumulator of all deployments
  const deploymentsMap = new Map<
    string,
    CannonicalEntityDeployment & {
      markAsDeployesFns: Required<DeployableEntity['markAsDeployed'][]>
    }
  >()
  const successfulDeployments = new Set<string>()

  type DeployableEntity = Parameters<IDeployerComponent['deployEntity']>[0]

  /**
   * This function is used to filter out (ignore) deployments coming from remote
   * servers only. Local deployments using POST /entities _ARE NOT_ filtered by this function.
   */
  async function shouldRemoteEntityDeploymentBeIgnored(entity: DeployableEntity): Promise<boolean> {
    // ignore specific entity types using EnvironmentConfig.SYNC_IGNORED_ENTITY_TYPES
    if (syncOptions.ignoredTypes.has(entity.entityType)) {
      return true
    }

    // ignore entities if those were successfully deployed during this execution
    if (successfulDeployments.has(entity.entityId)) return true

    // ignore entities that are already deployed locally
    if (await isEntityDeployed(components, entity.entityId)) {
      successfulDeployments.add(entity.entityId)
      return true
    }

    return false
  }

  async function handleDeploymentFromServers(entity: DeployableEntity, contentServers: string[]) {
    if (await shouldRemoteEntityDeploymentBeIgnored(entity)) {
      // early return to prevent noops
      components.metrics.increment('dcl_ignored_sync_deployments')
      if (entity.markAsDeployed) {
        await entity.markAsDeployed()
      }
      return
    }

    let elementInMap = deploymentsMap.get(entity.entityId)
    if (elementInMap) {
      // if the element to deploy exists in the map, then we add the server to the list for load balancing
      for (const contentServer of contentServers) {
        if (!elementInMap.servers.includes(contentServer)) {
          elementInMap.servers.push(contentServer)
        }
      }
      if (entity.markAsDeployed) {
        logs.debug('Entering mark as deployed zone')
        if (
          successfulDeployments.has(entity.entityId) ||
          (await components.failedDeployments.findFailedDeployment(entity.entityId))
        ) {
          await entity.markAsDeployed()
        } else {
          elementInMap.markAsDeployesFns.push(entity.markAsDeployed)
        }
      }
    } else {
      elementInMap = {
        entity,
        servers: contentServers,
        markAsDeployesFns: entity.markAsDeployed ? [entity.markAsDeployed] : []
      }

      deploymentsMap.set(entity.entityId, elementInMap)

      const metricLabels = { entity_type: entity.entityType }
      // increment the gauge of enqueued deployments
      components.metrics.increment('dcl_pending_deployment_gauge', metricLabels)

      const operationPriority = priorityBasedOnEntityType(entity.entityType)

      parallelDeploymentJobs
        .scheduleJobWithPriority(async () => {
          /**
           *  Entity should be marked as processed in the snapshot if anyone of these conditions is met:
           *  1. The entity is already deployed.
           *  2. The entity was sucessfully deployed.
           *  3. The entity failed to be deployed but was successfully persisted as failed deployment
           */
          let wasEntityProcessed = false
          try {
            if (await isEntityDeployed(components, entity.entityId)) {
              wasEntityProcessed = true
              return
            }

            await deployEntityFromRemoteServer(
              components,
              entity.entityId,
              entity.entityType,
              entity.authChain,
              elementInMap!.servers,
              DeploymentContext.SYNCED
            )
            wasEntityProcessed = true
            successfulDeployments.add(entity.entityId)
            deploymentsMap.delete(entity.entityId)
          } catch (err: any) {
            const errorDescription = err.toString()
            logs.warn(`Entity deployment failed`, {
              entityType: entity.entityType,
              entityId: entity.entityId,
              reason: errorDescription
            })
            // failed deployments are automatically rescheduled
            await components.failedDeployments.reportFailure({
              entityType: entity.entityType as any,
              entityId: entity.entityId,
              reason: FailureReason.DEPLOYMENT_ERROR,
              authChain: entity.authChain,
              errorDescription,
              failureTimestamp: components.clock.now()
            })
            wasEntityProcessed = true
          } finally {
            // decrement the gauge of enqueued deployments
            components.metrics.decrement('dcl_pending_deployment_gauge', metricLabels)
            // if (wasEntityProcessed && elementInMap) {
            //   for (const markAsDeployed of elementInMap.markAsDeployesFns) {
            //     await markAsDeployed()
            //   }
            // }
            if (wasEntityProcessed && entity.markAsDeployed) {
              await entity.markAsDeployed()
            }
          }
        }, operationPriority)
        .catch(logs.error)
    }
  }

  return {
    async stop() {
      // stop will wait for the queue to end.
      return parallelDeploymentJobs.onIdle()
    },
    onIdle() {
      return parallelDeploymentJobs.onIdle()
    },
    async deployEntity(
      entity: SnapshotSyncDeployment & { markAsDeployed?: () => Promise<void> },
      contentServers: string[]
    ): Promise<void> {
      await handleDeploymentFromServers(entity, contentServers)
      components.metrics.increment('dcl_batch_deployer_deployed_entitites_total')
    }
  }
}

export function priorityBasedOnEntityType(entityType: string) {
  switch (entityType) {
    case 'scene':
      return 1000
    case 'wearable':
      return 500
  }
  return 0
}
