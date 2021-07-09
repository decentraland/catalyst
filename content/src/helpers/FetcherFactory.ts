import { Fetcher } from 'dcl-catalyst-commons'
import { CURRENT_COMMIT_HASH, Environment, EnvironmentConfig } from '../Environment'

export class FetcherFactory {
  static create(env: Environment): Fetcher {
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

  static copy(originalFetcher: Fetcher): Fetcher {
    return new Fetcher(originalFetcher['customDefaults'])
  }
}
