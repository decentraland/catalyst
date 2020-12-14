import { Fetcher } from 'dcl-catalyst-commons'
import { EnvironmentConfig, Environment, CURRENT_COMMIT_HASH } from '../Environment'

export class FetcherFactory {
  static create(env: Environment): Fetcher {
    const fetchRequestTimeout = env.getConfig<string>(EnvironmentConfig.FETCH_REQUEST_TIMEOUT)
    return new Fetcher({
      timeout: fetchRequestTimeout,
      headers: { 'User-Agent': `content-server/${CURRENT_COMMIT_HASH} (+https://github.com/decentraland/catalyst)` }
    })
  }
}
