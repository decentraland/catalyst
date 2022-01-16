import { ServerBaseUrl } from '@catalyst/commons'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { AppComponents } from '../types'

/**
 * Waits until the cluster has a list of peers to connect to
 */
// TODO: make this an awaitable function inside contentCluster
export async function ensureListOfCatalysts(
  components: Pick<AppComponents, 'contentCluster'>,
  maxRetries: number,
  waitTime: number = 1000
): Promise<ServerBaseUrl[]> {
  let i = 0

  // iterate until we have a list of catalysts
  while (i++ < maxRetries) {
    const servers = components.contentCluster.getAllServersInCluster()

    if (servers.length) {
      return servers
    }

    await sleep(waitTime)
  }

  return []
}

export async function getChallengeInServer(
  components: Pick<AppComponents, 'fetcher'>,
  catalystBaseUrl: ServerBaseUrl
): Promise<string | undefined> {
  const response = await components.fetcher.fetch(`${catalystBaseUrl}/challenge`)
  if (!response.ok) return undefined
  const json: { challengeText: string } = await response.json()
  return json.challengeText
}
