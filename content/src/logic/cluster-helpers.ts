import { CatalystServerInfo } from '@dcl/catalyst-contracts'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export async function getChallengeInServer(
  components: Pick<AppComponents, 'fetcher'>,
  catalystBaseUrl: string
): Promise<string | undefined> {
  try {
    const response = await components.fetcher.fetch(`${catalystBaseUrl}/challenge`)
    if (!response || !response.ok) return undefined
    const json: { challengeText: string } = await response.json()
    return json.challengeText
  } catch {
    return undefined
  }
}

/**
 * Returns undefined when this servers configured CONTENT_SERVER_URL is unreachable or missconfigured
 * Returns id != 0x0 && owner != 0x0000000000000000000000000000000000000000 then this catalyst belongs to the DAO
 */
export async function determineCatalystIdentity(
  components: Pick<AppComponents, 'logs' | 'daoClient' | 'challengeSupervisor' | 'env' | 'fetcher'>,
  maxAttemps: number = 10,
  attempIntervalMs: number = process.env.CI ? 1_000 /* 1sec */ : 5_000 /* 5sec */
): Promise<CatalystServerInfo | undefined> {
  const logger = components.logs.getLogger('CatalystIdentityProvider')
  const normalizedContentServerAddress = normalizeContentBaseUrl(
    components.env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
  )
  // Attempts exist for a _good reason_, when the catalyst or NGINX or cloudflare or whatever proxying this service
  // is still warming up, there is a small chance that challenge based requests may be unreachable, thus we have attempts
  let attempts = 0
  try {
    logger.info('Attempting to determine my identity')
    while (attempts < maxAttemps) {
      logger.info(`Attempt to determine my identity #${attempts + 1}`)
      const response = await getChallengeInServer(components, normalizedContentServerAddress)

      if (response && components.challengeSupervisor.isChallengeOk(response)) {
        const daoServers = await components.daoClient.getAllContentServers()

        for (const server of daoServers) {
          if (normalizeContentBaseUrl(server.address) == normalizedContentServerAddress) {
            logger.info(`Calculated my identity in the DAO.`, server as any)
            return server
          }
        }

        // if there are servers in the DAO and this catalyst is not part of those. We still have an identity
        const myIdentity: CatalystServerInfo = {
          id: '0',
          address: normalizedContentServerAddress,
          owner: '0x0000000000000000000000000000000000000000'
        }
        logger.info(`Calculated my identity, not part of the DAO.`, myIdentity as any)
        return myIdentity
      }

      await sleep(attempIntervalMs)
      attempts++
    }
  } catch (error) {
    logger.error(`Failed to detect my own identity after ${attempts} attempts \n${error}`)
    throw error
  }
}

export function normalizeContentBaseUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, '')
}
