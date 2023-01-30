import { IFetchComponent } from '@well-known-components/http-server'
import { createFetchComponent } from 'dcl-catalyst-client'
import ms from 'ms'
import { CURRENT_COMMIT_HASH, EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export class FetcherFactory {
  static create(components: Pick<AppComponents, 'env'>): IFetchComponent {
    const { env } = components
    const fetchRequestTimeout = env.getConfig<string>(EnvironmentConfig.FETCH_REQUEST_TIMEOUT)
    const contentServerAddress = env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    return createFetchComponent({
      timeout: ms(fetchRequestTimeout),
      headers: {
        'User-Agent': `content-server/${CURRENT_COMMIT_HASH} (+https://github.com/decentraland/catalyst)`,
        Origin: contentServerAddress
      }
    })
  }
}
