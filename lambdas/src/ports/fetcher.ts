import { IFetchComponent } from '@well-known-components/interfaces'
import * as nodeFetch from 'node-fetch'

export function createFetchComponent(): IFetchComponent {
  const fetch: IFetchComponent = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init)
    }
  }
  return fetch
}
