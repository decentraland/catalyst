import { createCatalystDeploymentStream } from '@dcl/snapshots-fetcher'
import {
  createJobLifecycleManagerComponent,
  JobLifecycleManagerComponent
} from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import {
  IDeployerComponent,
  RemoteEntityDeployment,
  SnapshotsFetcherComponents
} from '@dcl/snapshots-fetcher/dist/types'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { IFetchComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import * as nodeFetch from 'node-fetch'
import { metricsComponent } from '../../metrics'
import { ClusterDeploymentsService } from '../Service'
import { createBatchDeployerComponent } from './batchDeployer'
import { ContentServerClient } from './clients/ContentServerClient'
import { ContentCluster } from './ContentCluster'

export type SynchronizationComponents = SnapshotsFetcherComponents & {
  metrics: typeof metricsComponent
  deployer: ClusterDeploymentsService
  config: {
    contentStorageFolder: string
  }
}

export type SynchronizerDeployerComponents = SynchronizationComponents & {
  batchDeployer: IDeployerComponent
  synchronizationJobManager: JobLifecycleManagerComponent
}

export type CannonicalEntityDeployment = { entity: RemoteEntityDeployment; servers: string[] }

export function createSincronizationComponents(options: {
  deploymentsService: ClusterDeploymentsService
  contentStorageFolder: string
}): SynchronizerDeployerComponents {
  const logger = createLogComponent()
  const fetcher = createFetchComponent()

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const snapshotComponents: SynchronizationComponents = {
    logger,
    downloadQueue,
    fetcher,
    metrics: metricsComponent,
    deployer: options.deploymentsService,
    config: {
      contentStorageFolder: options.contentStorageFolder
    }
  }

  const batchDeployer = createBatchDeployerComponent(snapshotComponents, {
    autoStart: true,
    concurrency: 10,
    timeout: 100000
  })

  const synchronizationJobManager = createJobLifecycleManagerComponent(
    { logger },
    {
      jobManagerName: 'SynchronizationJobManager',
      createJob(contentServer) {
        return createCatalystDeploymentStream(
          { ...snapshotComponents, deployer: batchDeployer },
          {
            contentFolder: options.contentStorageFolder,
            contentServer,

            // time between every poll to /pointer-changes
            pointerChangesWaitTime: 5000,

            // reconnection time for the whole catalyst
            reconnectTime: 1000,
            reconnectRetryTimeExponent: 1.2,

            // download entities retry
            requestMaxRetries: 10,
            requestRetryWaitTime: 5000
          }
        )
      }
    }
  )

  return {
    ...snapshotComponents,
    synchronizationJobManager,
    batchDeployer
  }
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
