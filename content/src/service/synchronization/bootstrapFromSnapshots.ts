import { getDeployedEntitiesStream } from '@dcl/snapshots-fetcher'
import { ensureListOfCatalysts } from '../../logic/cluster-helpers'
import { AppComponents } from '../../types'

type BootstrapComponents = Pick<
  AppComponents,
  'staticConfigs' | 'logs' | 'batchDeployer' | 'metrics' | 'fetcher' | 'downloadQueue' | 'contentCluster'
>

/**
 * This function fetches all the full snapshots from remote catalysts and
 * then iterates over all of the deployments to call the batch deployer for each deployed entity.
 */
export async function bootstrapFromSnapshots(components: BootstrapComponents): Promise<void> {
  // first ensure the content cluster gets our identity
  await components.contentCluster.getIdentity()

  // then find catalyst servers
  const catalystServers = await ensureListOfCatalysts(components, 30 /* up to 30 retries */, 1_000 /* wait time */)

  if (catalystServers.length == 0) {
    throw new Error('There are no servers. Cancelling bootstrapping')
  }

  const logs = components.logs.getLogger('BootstrapFromSnapshots')
  const requestMaxRetries = 2
  const requestRetryWaitTime = 1000

  // wait to get all the bootstrap data from all servers
  await Promise.all(
    catalystServers.map(async (contentServer) => {
      try {
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
