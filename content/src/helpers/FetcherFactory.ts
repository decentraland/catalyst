import { Fetcher } from 'dcl-catalyst-commons'
import { CURRENT_COMMIT_HASH, EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export class FetcherFactory {
  static create(components: Pick<AppComponents, 'env'>): Fetcher {
    const { env } = components
    const fetchRequestTimeout = env.getConfig<string>(EnvironmentConfig.FETCH_REQUEST_TIMEOUT)
    const contentServerAddress = env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    return new Fetcher({
      timeout: fetchRequestTimeout,
      headers: {
        'User-Agent': `content-server/${CURRENT_COMMIT_HASH} (+https://github.com/decentraland/catalyst)`,
        Origin: contentServerAddress
      }
    })
  }
}
