import { createFetchComponent } from '@well-known-components/fetch-component'
import { IFetchComponent, RequestOptions } from '@well-known-components/interfaces'
import ms from 'ms'
import * as fetch from 'node-fetch'
import { CURRENT_COMMIT_HASH, EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export class FetcherFactory {
  static create(components: Pick<AppComponents, 'env'>): IFetchComponent {
    const { env } = components
    const fetchRequestTimeout = env.getConfig<string>(EnvironmentConfig.FETCH_REQUEST_TIMEOUT)
    const contentServerAddress = env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    const fetcher = createFetchComponent({
      'User-Agent': `content-server/${CURRENT_COMMIT_HASH} (+https://github.com/decentraland/catalyst)`,
      Origin: contentServerAddress
    })
    return {
      fetch: async function fetch(url: fetch.RequestInfo, init?: RequestOptions): Promise<fetch.Response> {
        const receivedOptions = init ?? {}
        return fetcher.fetch(url, { ...receivedOptions, timeout: ms(fetchRequestTimeout) })
      }
    }
  }
}
