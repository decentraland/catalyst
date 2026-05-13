import { downloadEntityAndContentFiles } from '@dcl/snapshots-fetcher'
import { streamToBuffer } from '@dcl/catalyst-storage/dist/content-item'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { DeployableEntity, TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { AuthChain, EntityType } from '@dcl/schemas'
import { DeploymentContext, isInvalidDeployment, LocalDeploymentAuditInfo } from '../../deployment-types'
import { FailureReason } from '../../adapters/failed-deployments'
import { AppComponents, CannonicalEntityDeployment } from '../../types'
import { isEntityDeployed } from '../deployments'
import { joinOverlappedTimeRanges } from '../time-range'
import { IBatchDeployer } from './types'

const REQUEST_MAX_RETRIES = 10
const REQUEST_RETRY_WAIT_TIME = 1000

/**
 * An IDeployerComponent parallelizes deployments with a JobQueue.
 * The JobQueue concurrency can be configured.
 * The IDeployerComponent has a map of deployments that may be cleared up every now and then.
 * It assumes deployments can be received more than twice, every operation is assumed idempotent.
 * The deployments with different servers will count as one while they appear in the internal data structure (the map).
 * For every entityId, the servers are added to a mutable array that can and should be used to load balance the downloads.
 *
 * Also owns the per-entity remote-download-and-deploy flow (`deployEntityFromRemoteServer` /
 * `deployDownloadedEntity`). The shared load-balancing `serverLru` lives in the factory
 * closure so the state can't leak across multiple component instances (as it would when
 * declared at module scope).
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
    | 'failedDeploymentsReporter'
    | 'deploymentsRepository'
  >,
  syncOptions: {
    ignoredTypes: Set<string>
    queueOptions: createJobQueue.Options
    profileDuration: number
  }
): IBatchDeployer {
  const logs = components.logs.getLogger('DeployerComponent')

  const parallelDeploymentJobs = createJobQueue(syncOptions.queueOptions)

  // Returned component, captured by closures so internal calls to public methods route
  // through the returned object. Otherwise `jest.spyOn(component, 'deployEntityFromRemoteServer')`
  // would only intercept external callers (the property is overwritten on the returned
  // object), missing the internal call site inside `handleDeploymentFromServers`. Filled
  // via Object.assign after all the inner functions are declared.
  const self: IBatchDeployer = {} as IBatchDeployer

  // accumulator of all deployments
  const deploymentsMap = new Map<
    string,
    CannonicalEntityDeployment & {
      markAsDeployedFns: Required<DeployableEntity['markAsDeployed'][]>
    }
  >()
  const successfulDeployments = new Set<string>()

  // Per-instance load-balancing LRU for round-robin selection across mirror servers.
  // Used by `deployEntityFromRemoteServer` to spread download requests across the catalyst
  // cluster — previously a module-level Map shared by all callers; encapsulated here so
  // tests get a fresh instance per component and the state can't drift between runs.
  const serverLru = new Map<string, number>()

  async function downloadFullEntity(entityId: string, entityType: string, servers: string[]): Promise<unknown> {
    components.metrics.increment('dcl_pending_download_gauge', { entity_type: entityType })
    try {
      return await downloadEntityAndContentFiles(
        components,
        entityId,
        servers,
        serverLru,
        components.staticConfigs.tmpDownloadFolder,
        REQUEST_MAX_RETRIES,
        REQUEST_RETRY_WAIT_TIME
      )
    } finally {
      components.metrics.decrement('dcl_pending_download_gauge', { entity_type: entityType })
    }
  }

  async function deployDownloadedEntity(
    entityId: string,
    entityType: string,
    auditInfo: LocalDeploymentAuditInfo,
    context: DeploymentContext
  ): Promise<void> {
    const deploymentTimeTimer = components.metrics.startTimer('dcl_deployment_time', { entity_type: entityType })

    try {
      const entityInStorage = await components.storage.retrieve(entityId)

      if (!entityInStorage) throw new Error('Entity ' + entityId + ' cannot be retrieved from storage')

      const entityFile = await streamToBuffer(await entityInStorage.asStream())

      if (entityFile.length == 0) {
        throw new Error('Trying to deploy empty entityFile')
      }

      const deploymentResult = await components.deployer.deployEntity([entityFile], entityId, auditInfo, context)
      if (isInvalidDeployment(deploymentResult)) {
        throw new Error(
          `Errors deploying entity(${entityId}):\n${deploymentResult.errors.map(($) => ' - ' + $).join('\n')}`
        )
      }

      deploymentTimeTimer.end({ failed: 'false' })
    } catch (err: any) {
      deploymentTimeTimer.end({ failed: 'true' })
      throw err
    }
  }

  async function deployEntityFromRemoteServer(
    entityId: string,
    entityType: string,
    authChain: AuthChain,
    servers: string[],
    context: DeploymentContext
  ): Promise<void> {
    await downloadFullEntity(entityId, entityType, servers)
    await deployDownloadedEntity(entityId, entityType, { authChain }, context)
  }

  /**
   * This function is used to filter out (ignore) deployments coming from remote
   * servers only. Local deployments using POST /entities _ARE NOT_ filtered by this function.
   */
  async function shouldRemoteEntityDeploymentBeIgnored(entity: DeployableEntity): Promise<boolean> {
    // ignore specific entity types using EnvironmentConfig.SYNC_IGNORED_ENTITY_TYPES
    if (syncOptions.ignoredTypes.has(entity.entityType)) {
      return true
    }

    // ignore old profiles
    if (entity.entityType === EntityType.PROFILE && entity.entityTimestamp < Date.now() - syncOptions.profileDuration) {
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
                await self.deployEntityFromRemoteServer(
                  entity.entityId,
                  entity.entityType,
                  entity.authChain,
                  elementInMap.servers,
                  DeploymentContext.SYNCED
                )
                wasEntityProcessed = true
                successfulDeployments.add(entity.entityId)
                logs.info(`Synced deployment successful`, {
                  entityType: entity.entityType,
                  entityId: entity.entityId,
                  pointer: entity.pointers?.[0],
                  servers: elementInMap.servers.join(',')
                })
              } catch (err: any) {
                const errorDescription = err.toString()
                logs.warn(`Entity deployment failed`, {
                  entityType: entity.entityType,
                  entityId: entity.entityId,
                  reason: errorDescription
                })
                // failed deployments are automatically rescheduled
                await components.failedDeploymentsReporter.reportFailure({
                  entityType: entity.entityType as any,
                  entityId: entity.entityId,
                  reason: FailureReason.DEPLOYMENT_ERROR,
                  authChain: entity.authChain,
                  errorDescription,
                  failureTimestamp: Date.now(),
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

  Object.assign(self, {
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
    },
    deployEntityFromRemoteServer,
    deployDownloadedEntity
  })
  return self
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
