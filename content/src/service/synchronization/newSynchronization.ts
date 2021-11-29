import { createCatalystDeploymentStream } from '@dcl/snapshots-fetcher'
import { createJobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { createLogComponent } from '@well-known-components/logger'
import { metricsComponent } from '../../metrics'
import { createBloomFilterComponent } from '../../ports/bloomFilter'
import { createFetchComponent } from '../../ports/fetcher'
import { IDatabaseComponent } from '../../ports/postgres'
import { AppComponents, DeployerComponent } from '../../types'
import { createBatchDeployerComponent } from './batchDeployer'
import { ContentServerClient } from './clients/ContentServerClient'
import { ContentCluster } from './ContentCluster'

export async function createSincronizationComponents(options: {
  deploymentsService: DeployerComponent
  database: IDatabaseComponent
  contentStorageFolder: string
}): Promise<AppComponents> {
  const deployer = options.deploymentsService
  const metrics = metricsComponent
  const database = options.database
  const staticConfigs: AppComponents['staticConfigs'] = {
    contentStorageFolder: options.contentStorageFolder
  }

  const logs = createLogComponent()
  const fetcher = createFetchComponent()

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const deployedEntitiesFilter = createBloomFilterComponent({
    sizeInBytes: 512
  })

  const batchDeployer = createBatchDeployerComponent(
    {
      logs,
      downloadQueue,
      fetcher,
      database,
      metrics,
      deployer,
      deployedEntitiesFilter,
      staticConfigs
    },
    {
      autoStart: true,
      concurrency: 10,
      timeout: 100000
    }
  )

  const synchronizationJobManager = createJobLifecycleManagerComponent(
    { logs },
    {
      jobManagerName: 'SynchronizationJobManager',
      createJob(contentServer) {
        return createCatalystDeploymentStream(
          { logs, downloadQueue, fetcher, metrics, deployer: batchDeployer },
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

  // TODO: this is usually done at the end when all components are
  // created and wired together
  await batchDeployer.start()

  return {
    logs,
    downloadQueue,
    fetcher,
    database,
    metrics,
    deployer,
    deployedEntitiesFilter,
    staticConfigs,
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
