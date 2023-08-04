import { IDeployerComponent } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { DeployableEntity, TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent } from '@well-known-components/interfaces'
import { DeploymentContext } from '../../deployment-types.js'
import { isEntityDeployed } from '../../logic/deployments.js'
import { joinOverlappedTimeRanges } from '../../logic/time-range.js'
import { FailureReason } from '../../ports/failedDeployments.js'
import { AppComponents, CannonicalEntityDeployment } from '../../types.js'
import { deployEntityFromRemoteServer } from './deployRemoteEntity.js'

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
      markAsDeployedFns: Required<DeployableEntity['markAsDeployed'][]>
    }
  >()
  const successfulDeployments = new Set<string>()

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
    if (await isEntityDeployed(components.database, components, entity.entityId, entity.entityTimestamp)) {
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

    const existentElementInMap = deploymentsMap.get(entity.entityId)
    if (existentElementInMap) {
      // if the element to deploy exists in the map, then we add the server to the list for load balancing
      for (const contentServer of contentServers) {
        if (!existentElementInMap.servers.includes(contentServer)) {
          existentElementInMap.servers.push(contentServer)
        }
      }
      if (entity.markAsDeployed) {
        const wasAlreadyProcessed =
          successfulDeployments.has(entity.entityId) ||
          (await components.failedDeployments.findFailedDeployment(entity.entityId))
        if (wasAlreadyProcessed) {
          await entity.markAsDeployed()
        } else {
          existentElementInMap.markAsDeployedFns.push(entity.markAsDeployed)
        }
      }
    } else {
      const newElementInMap = {
        entity,
        servers: contentServers,
        markAsDeployedFns: entity.markAsDeployed ? [entity.markAsDeployed] : []
      }

      deploymentsMap.set(entity.entityId, newElementInMap)

      const metricLabels = { entity_type: entity.entityType }

      const operationPriority = priorityBasedOnEntityType(entity.entityType)

      try {
        await parallelDeploymentJobs.onSizeLessThan(1000)

        // increment the gauge of enqueued deployments
        components.metrics.increment('dcl_pending_deployment_gauge', metricLabels)

        parallelDeploymentJobs
          .scheduleJobWithPriority(async () => {
            /**
             *  Entity should be marked as processed in the snapshot if anyone of these conditions is met:
             *  1. The entity is already deployed.
             *  2. The entity was sucessfully deployed.
             *  3. The entity failed to be deployed but was successfully persisted as failed deployment
             */
            // 1. The entity is already deployed, early return.
            if (await isEntityDeployed(components.database, components, entity.entityId, entity.entityTimestamp)) {
              const markAsDeployedFns = deploymentsMap.get(entity.entityId)?.markAsDeployedFns ?? []
              for (const markAsDeployed of markAsDeployedFns) {
                await markAsDeployed()
              }
              successfulDeployments.add(entity.entityId)
              deploymentsMap.delete(entity.entityId)
              return
            }

            // 2. and 3. We try to deploy the entity or add it to fail deployments
            let wasEntityProcessed = false
            let elementInMap = deploymentsMap.get(entity.entityId)
            if (elementInMap) {
              try {
                await deployEntityFromRemoteServer(
                  components,
                  entity.entityId,
                  entity.entityType,
                  entity.authChain,
                  elementInMap.servers,
                  DeploymentContext.SYNCED
                )
                wasEntityProcessed = true
                successfulDeployments.add(entity.entityId)
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
                  failureTimestamp: components.clock.now(),
                  snapshotHash: entity.snapshotHash
                })
                wasEntityProcessed = true
              } finally {
                // We get the element again, because in the middle of the deploy/failed it could be added new 'markAsDeployed'
                elementInMap = deploymentsMap.get(entity.entityId) ?? elementInMap
                // decrement the gauge of enqueued deployments
                components.metrics.decrement('dcl_pending_deployment_gauge', metricLabels)
                if (wasEntityProcessed) {
                  for (const markAsDeployed of elementInMap?.markAsDeployedFns) {
                    await markAsDeployed()
                  }
                }
                deploymentsMap.delete(entity.entityId)
              }
            } else {
              // This should never happen as this scheduled fn is added after the deploymentsMap is set the entityId
              throw new Error('element in map does not exist! this should never happen')
            }
          }, operationPriority)
          .catch(logs.error)
      } catch (err: any) {
        logs.error(err)
      }
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
    async scheduleEntityDeployment(entity: DeployableEntity, contentServers: string[]): Promise<void> {
      await handleDeploymentFromServers(entity, contentServers)
    },
    async prepareForDeploymentsIn(timeRanges: TimeRange[]): Promise<void> {
      for (const timeRange of joinOverlappedTimeRanges(timeRanges)) {
        await components.deployedEntitiesBloomFilter.addAllInTimeRange(timeRange)
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
