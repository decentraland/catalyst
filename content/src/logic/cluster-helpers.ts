import { ServerBaseUrl } from '@catalyst/commons'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { ContentCluster } from '../service/synchronization/ContentCluster'

/**
 * Waits until the cluster has a list of peers to connect to
 */
export async function ensureListOfCatalysts(
  cluster: ContentCluster,
  maxRetries: number,
  waitTime: number = 1000
): Promise<ServerBaseUrl[]> {
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
