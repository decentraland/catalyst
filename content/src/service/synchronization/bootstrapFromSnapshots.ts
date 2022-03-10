import { getDeployedEntitiesStream } from '@dcl/snapshots-fetcher'
import { AppComponents } from '../../types'

type BootstrapComponents = Pick<
  AppComponents,
  'staticConfigs' | 'logs' | 'batchDeployer' | 'metrics' | 'fetcher' | 'downloadQueue' | 'contentCluster' | 'storage'
>

/**
 * This function fetches all the full snapshots from remote catalysts and
 * then iterates over all of the deployments to call the batch deployer for each deployed entity.
 */
export async function bootstrapFromSnapshots(components: BootstrapComponents): Promise<void> {
  // then find all other DAO catalyst servers
  const catalystServersButThisOne = await components.contentCluster.getContentServersFromDao()

  if (catalystServersButThisOne.length == 0) {
    throw new Error('There are no servers. Cancelling bootstrapping')
  }

  const logs = components.logs.getLogger('BootstrapFromSnapshots')
  logs.info(`Starting to bootstrap from snapshots`)
  const requestMaxRetries = 2
  const requestRetryWaitTime = 1000

  // wait to get all the bootstrap data from all servers
  await Promise.all(
    catalystServersButThisOne.map(async (contentServer) => {
      logs.info(`Will deploy entities from ${contentServer} snapshots`)
      try {
        const stream = getDeployedEntitiesStream(components, {
          tmpDownloadFolder: components.staticConfigs.tmpDownloadFolder,
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
        logs.warn(`There was an error deploying entities from ${contentServer} snapshots`, error)
      }
    })
  )

  // wait for background jobs to finish
  await components.downloadQueue.onIdle()
  await components.batchDeployer.onIdle()
}
