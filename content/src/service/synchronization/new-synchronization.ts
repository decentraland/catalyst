import {
  createCatalystDeploymentStream,
  downloadEntityAndContentFiles,
  getDeployedEntitiesStream
} from '@dcl/snapshots-fetcher'
import {
  createJobLifecycleManagerComponent,
  JobLifecycleManagerComponent
} from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { RemoteEntityDeployment, SnapshotsFetcherComponents } from '@dcl/snapshots-fetcher/dist/types'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { IFetchComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { EntityType } from 'dcl-catalyst-commons'
import * as nodeFetch from 'node-fetch'
import { FailureReason } from '../errors/FailedDeploymentsManager'
import { ContentServerClient } from './clients/ContentServerClient'
import { ContentCluster } from './ContentCluster'
import { EventDeployer } from './EventDeployer'

export type IDeployerComponent = {
  deployEntity(entity: RemoteEntityDeployment, contentServer: string): Promise<void>
  onIdle(): Promise<void>
}

export type SynchronizerDeployerComponents = SnapshotsFetcherComponents & {
  deployer: IDeployerComponent
  synchronizationJobManager: JobLifecycleManagerComponent
}

export type CannonicalEntityDeployment = { entity: RemoteEntityDeployment; servers: string[] }

/**
 * An IDeployerComponent parallelizes deployments with a JobQueue.
 * The JobQueue concurrency can be configured.
 * The IDeployerComponent has a map of deployments that may be cleared up every now and then.
 * It does NOT checks for duplicates, every operation is assumed idempotent.
 * The deployments with different servers will count as one while they appear in the internal data structure.
 * For every entityId, the servers are added to a mutable array that can and should be used to load balance the downloads.
 */
export function createDeployerComponent(
  components: Omit<SnapshotsFetcherComponents, 'deployer'>,
  options: {
    eventDeployer: EventDeployer
    contentStorageFolder: string
  }
): IDeployerComponent {
  const requestMaxRetries = 10
  const requestRetryWaitTime = 1000

  const logs = components.logger.getLogger('DeployerComponent')

  const parallelDeploymentJobs = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 100000
  })

  // accumulator of all deployments
  const deploymentsMap = new Map<string, CannonicalEntityDeployment>()

  // this is used for loadbalancing servers
  const serverLru = new Map<string, number>()

  // TODO: every now and then cleanup the deploymentsMap of old deployments

  return {
    onIdle() {
      return parallelDeploymentJobs.onIdle()
    },
    async deployEntity(entity: RemoteEntityDeployment, contentServer: string): Promise<void> {
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

        parallelDeploymentJobs.scheduleJobWithRetries(async () => {
          logs.debug(`Downloading entity ${entity.entityId} (${entity.entityType})`)

          await downloadEntityAndContentFiles(
            components,
            entity.entityId,
            elementInMap!.servers,
            serverLru,
            options.contentStorageFolder,
            requestMaxRetries,
            requestRetryWaitTime
          )

          logs.debug(`Deploying entity ${entity.entityId} (${entity.entityType})`)

          try {
            await options.eventDeployer.deployEntityFromLocalDisk(
              entity.entityId,
              entity.authChain,
              options.contentStorageFolder
            )
          } catch (e: any) {
            logs.error(e)
            await options.eventDeployer.reportError({
              deployment: { entityType: entity.entityType as EntityType, entityId: entity.entityId },
              reason: FailureReason.DEPLOYMENT_ERROR,
              description: (e || 'Unknown error').toString()
            })
          }
        }, 10)
      }
    }
  }
}

export function createSincronizationComponents(options: {
  eventDeployer: EventDeployer
  contentStorageFolder: string
}): SynchronizerDeployerComponents {
  const logger = createLogComponent()
  const fetcher = createFetchComponent()

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const snapshotComponents: SnapshotsFetcherComponents = {
    logger,
    downloadQueue,
    fetcher
  }

  const deployer = createDeployerComponent(snapshotComponents, options)
  const synchronizationJobManager = createJobLifecycleManagerComponent(
    { logger },
    {
      jobManagerName: 'synchronizationJobManager',
      createJob(contentServer) {
        const deploymentFetcher = createCatalystDeploymentStream(snapshotComponents, {
          contentFolder: options.contentStorageFolder,
          contentServer: contentServer,
          pointerChangesWaitTime: 1000,
          reconnectTime: 1000,
          requestMaxRetries: 100,
          requestRetryWaitTime: 1000
        })

        // send the deployment to the deployer component
        deploymentFetcher.onDeployment(async (deployment) => {
          deployer.deployEntity(deployment, contentServer)
        })

        return deploymentFetcher
      }
    }
  )

  return {
    ...snapshotComponents,
    synchronizationJobManager,
    deployer
  }
}

export async function bootstrapFromSnapshots(
  components: SynchronizerDeployerComponents,
  cluster: ContentCluster,
  contentStorageFolder: string
): Promise<void> {
  const catalystServers = await ensureListOfCatalysts(cluster, 10 /* retries */, 1000 /* wait time */)

  if (catalystServers.length == 0) {
    console.log('There are no servers. Cancelling bootstrapping')
    return
  }

  const logs = components.logger.getLogger('BootstrapFromSnapshots')
  const requestMaxRetries = 10
  const requestRetryWaitTime = 1000

  // wait to get all the bootstrap data from all servers
  await Promise.allSettled(
    catalystServers.map(async (server) => {
      try {
        const contentServer = server.getContentUrl()
        const stream = getDeployedEntitiesStream(components, {
          contentFolder: contentStorageFolder,
          contentServer,
          pointerChangesWaitTime: 0, // zero to not restart the timer
          requestMaxRetries,
          requestRetryWaitTime,
          fromTimestamp: 0 // start from the beginning of the times every time. it is cheap
        })
        for await (const entity of stream) {
          await components.deployer.deployEntity(entity, contentServer)
        }
      } catch (error: any) {
        logs.error(error)
      }
    })
  )

  // wait for background jobs to finish
  await components.downloadQueue.onIdle()
  await components.deployer.onIdle()
}

/**
 * Waits until the cluster has a list of peers to connect to
 */
export async function ensureListOfCatalysts(
  cluster: ContentCluster,
  maxRetries: number,
  waitTime: number = 1000
): Promise<ContentServerClient[]> {
  let i = 0

  // iterate until we have a list of catalysts
  while (i++ < maxRetries) {
    const servers = cluster.getAllServersInCluster()

    if (servers.length) {
      return servers
    }

    await sleep(waitTime)
  }

  return []
}

export function createFetchComponent() {
  const fetch: IFetchComponent = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init)
    }
  }
  return fetch
}
