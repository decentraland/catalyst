import { retry } from '@katalyst/content/helpers/RetryHelper'
import log4js from 'log4js'
import { ContentServerClient } from './clients/ContentServerClient'
import { ContentCluster } from './ContentCluster'

const LOGGER = log4js.getLogger('ClusterUtils')

/**
 * This method tries to execute a request on all cluster servers, until one responds successfully
 */
export async function tryOnCluster<T>(
  execution: (server: ContentServerClient) => Promise<T>,
  cluster: ContentCluster,
  description: string,
  options?: { retries?: number; preferred?: ContentServerClient }
): Promise<T> {
  const clusters = cluster.getAllServersInCluster()
  LOGGER.debug(`Will try the request on ${clusters}`)
  // Re order server list
  const servers = reorderAccordingToPreference(clusters, options?.preferred)
  LOGGER.debug(`Sorted clusters are: ${servers}`)

  // Calculate amount of retries. Default is one
  const retries = options?.retries ?? 1
  LOGGER.debug(`Will retry the request times: ${retries}`)

  return retry(
    async () => {
      // Try on every cluster server, until one answers the request
      for (const server of servers) {
        try {
          LOGGER.debug(`Executing for : ${server}`)
          return await execution(server)
        } catch (error) {
          LOGGER.debug(`Tried to ${description} on '${server.getAddress()}' but it failed because of: ${error}`)
        }
      }
      throw new Error(`Tried to ${description} on all servers on the cluster, but they all failed`)
    },
    retries + 1,
    `${description} on all servers on the cluster`,
    '1s'
  )
}

function reorderAccordingToPreference(
  activeServers: ContentServerClient[],
  preferred: ContentServerClient | undefined
): ContentServerClient[] {
  if (preferred) {
    const newOrder = activeServers.filter((server) => server.getAddress() != preferred.getAddress())
    newOrder.unshift(preferred)
    return newOrder
  } else {
    return activeServers
  }
}

export function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
