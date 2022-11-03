import { DeploymentWithAuthChain } from '@dcl/schemas'
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
    | 'processedSnapshots'
  >,
  syncOptions: {
    ignoredTypes: Set<string>
    queueOptions: createJobQueue.Options
  }
): IDeployerComponent & IBaseComponent {
  const logs = components.logs.getLogger('DeployerComponent')

  const parallelDeploymentJobs = createJobQueue(syncOptions.queueOptions)

  // accumulator of all deployments
  const deploymentsMap = new Map<string, CannonicalEntityDeployment>()
  const successfulDeployments = new Set<string>()

  /**
   * This function is used to filter out (ignore) deployments coming from remote
   * servers only. Local deployments using POST /entities _ARE NOT_ filtered by this function.
   */
  async function shouldRemoteEntityDeploymentBeIgnored(entity: DeploymentWithAuthChain): Promise<boolean> {
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

  async function handleDeploymentFromServer(
    entity: DeploymentWithAuthChain & { snapshotHash?: string },
    contentServer: string
  ) {
    if (await shouldRemoteEntityDeploymentBeIgnored(entity)) {
      // early return to prevent noops
      components.metrics.increment('dcl_ignored_sync_deployments')
      if (entity.snapshotHash) {
        await components.processedSnapshots.entityProcessedFrom(entity.snapshotHash)
      }
      return
    }

    let elementInMap = deploymentsMap.get(entity.entityId)
    if (elementInMap) {
      // if the element to deploy exists in the map, then we add the server to the list for load balancing
      if (!elementInMap.servers.includes(contentServer)) {
        elementInMap.servers.push(contentServer)
      }
    } else {
      elementInMap = {
        entity,
        servers: [contentServer]
      }

      deploymentsMap.set(entity.entityId, elementInMap)

      const metricLabels = { entity_type: entity.entityType }
      // increment the gauge of enqueued deployments
      components.metrics.increment('dcl_pending_deployment_gauge', metricLabels)

      const operationPriority = priorityBasedOnEntityType(entity.entityType)

      parallelDeploymentJobs
        .scheduleJobWithPriority(async () => {
          try {
            if (await isEntityDeployed(components, entity.entityId)) {
              if (entity.snapshotHash) {
                await components.processedSnapshots.entityProcessedFrom(entity.snapshotHash)
              }
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

            successfulDeployments.add(entity.entityId)
            deploymentsMap.delete(entity.entityId)
            if (entity.snapshotHash) {
              await components.processedSnapshots.entityProcessedFrom(entity.snapshotHash)
            }
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
            if (entity.snapshotHash) {
              await components.processedSnapshots.entityProcessedFrom(entity.snapshotHash)
            }
          } finally {
            // decrement the gauge of enqueued deployments
            components.metrics.decrement('dcl_pending_deployment_gauge', metricLabels)
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
      entity: DeploymentWithAuthChain & { snapshotHash?: string },
      contentServers: string[]
    ): Promise<void> {
      for (const contentServer of contentServers) {
        await handleDeploymentFromServer(entity, contentServer)
      }
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
