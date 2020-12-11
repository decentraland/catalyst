import { Fetcher } from 'dcl-catalyst-commons'
import { EnvironmentConfig, Environment, CURRENT_COMMIT_HASH } from '../Environment'

export class FetcherFactory {
  private static readonly USER_AGENT_VALUE = `content-server/${CURRENT_COMMIT_HASH} (+https://github.com/decentraland/catalyst)`

  static create(env: Environment): Fetcher {
    const fetchRequestTimeout = env.getConfig<string>(EnvironmentConfig.FETCH_REQUEST_TIMEOUT)
    return new Fetcher({ timeout: fetchRequestTimeout, headers: { 'User-Agent': this.USER_AGENT_VALUE } })
  }
}
