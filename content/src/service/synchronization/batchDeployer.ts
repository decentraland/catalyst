import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { IDeployerComponent, RemoteEntityDeployment } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent } from '@well-known-components/interfaces'
import { deploymentExists, streamAllEntityIds } from '../../logic/database-queries/deployments-queries'
import { FailureReason } from '../../ports/failedDeploymentsCache'
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
    | 'deployedEntitiesFilter'
  >,
  queueOptions: createJobQueue.Options
): IDeployerComponent & IBaseComponent {
  const logs = components.logs.getLogger('DeployerComponent')

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
            // this condition should be carefully handled:
            // 1) it first uses the bloom filter to know wheter or not an entity may exist or definitely don't exist (.check)
            // 2) then it checks against the DB (deploymentExists)
            const alreadyDeployed =
              components.deployedEntitiesFilter.check(entity.entityId) &&
              (await deploymentExists(components, entity.entityId))

            if (alreadyDeployed) {
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
            components.deployedEntitiesFilter.add(entity.entityId)
          } catch (err: any) {
            // failed deployments are automatically rescheduled
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

  async function createBloomFilterDeployments() {
    const start = Date.now()

    const filter = components.deployedEntitiesFilter
    filter.reset()
    let elements = 0
    for await (const row of streamAllEntityIds(components)) {
      elements++
      filter.add(row.entityId)
    }
    logs.info(`Bloom filter recreated.`, { timeMs: Date.now() - start, elements })
  }

  // TODO: [new-sync] every now and then cleanup the deploymentsMap of old deployments

  return {
    async start() {
      await createBloomFilterDeployments()
    },
    async stop() {
      return parallelDeploymentJobs.onIdle()
    },
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
      return 1000
    case 'wearable':
      return 500
  }
  return 0
}
