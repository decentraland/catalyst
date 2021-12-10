import { getDeployedEntitiesStream } from '@dcl/snapshots-fetcher'
import { AppComponents } from '../../types'
import { ContentCluster } from './ContentCluster'
import { ensureListOfCatalysts } from './newSynchronization'

type BootstrapComponents = Pick<
  AppComponents,
  'staticConfigs' | 'logs' | 'batchDeployer' | 'metrics' | 'fetcher' | 'downloadQueue'
>

/**
 * This function fetches all the full snapshots from remote catalysts and
 * then iterates over all of the deployments to call the batch deployer for each deployed entity.
 */
export async function bootstrapFromSnapshots(components: BootstrapComponents, cluster: ContentCluster): Promise<void> {
  const catalystServers = await ensureListOfCatalysts(cluster, 10 /* retries */, 1000 /* wait time */)

  if (catalystServers.length == 0) {
    console.error('There are no servers. Cancelling bootstrapping')
    return
  }

  const logs = components.logs.getLogger('BootstrapFromSnapshots')
  const requestMaxRetries = 2
  const requestRetryWaitTime = 1000

  // wait to get all the bootstrap data from all servers
  await Promise.all(
    catalystServers.map(async (server) => {
      try {
        const contentServer = server.getBaseUrl()
        const stream = getDeployedEntitiesStream(components, {
          contentFolder: components.staticConfigs.contentStorageFolder,
          contentServer,
          pointerChangesWaitTime: 0, // zero to not restart the timer
          requestMaxRetries,
          requestRetryWaitTime,
          fromTimestamp: 0 // start bootstrap from the beginning of the times every time. it is cheap
        })
        for await (const entity of stream) {
          // schedule the deployment in the deployer. the await DOES NOT mean that the entity was deployed entirely.
          await components.batchDeployer.deployEntity(entity, [contentServer])
        }
      } catch (error: any) {
        logs.warn(error)
      }
    })
  )

  // wait for background jobs to finish
  await components.downloadQueue.onIdle()
  await components.batchDeployer.onIdle()
}
