import { delay, ServerBaseUrl, ServerMetadata } from '@catalyst/commons'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

const IDENTITY_DETERMINATION_MAX_ATTEMPTS = 10
const IDENTITY_DETERMINATION_ATTEMPTS_INTERVAL = process.env.CI ? 1_000 /* 1sec */ : 5_000 /* 5sec */

export async function getChallengeInServer(
  components: Pick<AppComponents, 'fetcher'>,
  catalystBaseUrl: ServerBaseUrl
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
  components: Pick<AppComponents, 'logs' | 'daoClient' | 'challengeSupervisor' | 'env' | 'fetcher'>
): Promise<ServerMetadata | undefined> {
  const logger = components.logs.getLogger('CatalystIdentityProvider')
  const normalizedContentServerAddress = normalizeContentBaseUrl(
    components.env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
  )
  try {
    logger.info('Attempting to determine my identity')

    // Attempts exist for a _good reason_, when the catalyst or NGINX or cloudflare or whatever proxying this service
    // is still warming up, there is a small chance that challenge based requests may be unreachable, thus we have attempts
    let attempts = IDENTITY_DETERMINATION_MAX_ATTEMPTS
    while (attempts > 0) {
      const response = await getChallengeInServer(components, normalizedContentServerAddress)

      if (response && components.challengeSupervisor.isChallengeOk(response)) {
        const daoServers = await components.daoClient.getAllContentServers()

        for (const server of daoServers) {
          if (normalizeContentBaseUrl(server.baseUrl) == normalizedContentServerAddress) {
            logger.info(`Calculated my identity in the DAO.`, server)
            return server
          }
        }

        // if there are servers in the DAO and this catalyst is not part of those. We still have an identity
        const myIdentity: ServerMetadata = {
          id: '0x0',
          baseUrl: normalizedContentServerAddress,
          owner: '0x0000000000000000000000000000000000000000'
        }
        logger.info(`Calculated my identity, not part of the DAO.`, myIdentity)
        return myIdentity
      }

      attempts--
      if (attempts > 0) {
        logger.debug(`Retrying`, { attempts })
        await delay(IDENTITY_DETERMINATION_ATTEMPTS_INTERVAL)
      }
    }
  } catch (error) {
    logger.error(`Failed to detect my own identity \n${error}`)
    throw error
  }
}

export function normalizeContentBaseUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, '')
}
