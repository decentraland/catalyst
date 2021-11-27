import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { IDeployerComponent, RemoteEntityDeployment } from '@dcl/snapshots-fetcher/dist/types'
import { FailureReason } from '../errors/FailedDeploymentsManager'
import { deployEntityFromRemoteServer } from './deployRemoteEntity'
import { CannonicalEntityDeployment, SynchronizationComponents } from './newSynchronization'

/**
 * An IDeployerComponent parallelizes deployments with a JobQueue.
 * The JobQueue concurrency can be configured.
 * The IDeployerComponent has a map of deployments that may be cleared up every now and then.
 * It does NOT checks for duplicates, every operation is assumed idempotent.
 * The deployments with different servers will count as one while they appear in the internal data structure (the map).
 * For every entityId, the servers are added to a mutable array that can and should be used to load balance the downloads.
 */
export function createBatchDeployerComponent(
  components: SynchronizationComponents,
  queueOptions: createJobQueue.Options
): IDeployerComponent {
  const logs = components.logger.getLogger('DeployerComponent')

  const parallelDeploymentJobs = createJobQueue(queueOptions)

  // accumulator of all deployments
  const deploymentsMap = new Map<string, CannonicalEntityDeployment>()

  async function handleDeploymentFromServer(entity: RemoteEntityDeployment, contentServer: string) {
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
            await deployEntityFromRemoteServer(
              components,
              entity.entityId,
              entity.entityType,
              entity.authChain,
              elementInMap!.servers
            )
            // failed deployments are automaticcally rescheduled
          } catch (err: any) {
            await components.deployer.reportErrorDuringSync(
              entity.entityType as any,
              entity.entityId,
              FailureReason.DEPLOYMENT_ERROR,
              entity.authChain,
              err.toString()
            )
          } finally {
            // decrement the gauge of enqueued deployments
            components.metrics.decrement('dcl_pending_deployment_gauge', metricLabels)
          }
        }, operationPriority)
        .catch(logs.error)
    }
  }

  // TODO: every now and then cleanup the deploymentsMap of old deployments

  return {
    onIdle() {
      return parallelDeploymentJobs.onIdle()
    },
    async deployEntity(entity: RemoteEntityDeployment, contentServers: string[]): Promise<void> {
      for (const contentServer of contentServers) {
        await handleDeploymentFromServer(entity, contentServer)
      }
    }
  }
}

export function priorityBasedOnEntityType(entityType: string) {
  switch (entityType) {
    case 'scene':
    case 'wearable':
      return 1000
  }
  return 0
}
