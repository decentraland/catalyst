import { createFetchComponent } from '@well-known-components/fetch-component'
import { IFetchComponent, RequestOptions } from '@well-known-components/interfaces'
import log4js from 'log4js'
/**
 * This fetcher tries to use the internal docker network to connect lambdas with the content server.
 * If it can't, then it will try to contact it externally
 */
export class SmartContentServerFetcher {
  private static INTERNAL_CONTENT_SERVER_URL: string = `http://content-server:6969`
  private static LOGGER = log4js.getLogger('SmartContentServerFetcher')

  private contentServerUrl: string | undefined
  private fetcher: IFetchComponent

  constructor(private readonly externalContentServerUrl: string) {
    this.fetcher = createFetchComponent()
  }

  async getContentServerUrl(): Promise<string> {
    if (!this.contentServerUrl) {
      try {
        await (await this.fetcher.fetch(`${SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL}/status`)).json()
        SmartContentServerFetcher.LOGGER.info('Will use the internal content server url')
        this.contentServerUrl = SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL
        return this.contentServerUrl
      } catch {}
      SmartContentServerFetcher.LOGGER.info('Will use the external content server url')
      this.contentServerUrl = this.externalContentServerUrl
    }
    return this.contentServerUrl
  }

  getExternalContentServerUrl(): string {
    return this.externalContentServerUrl
  }

  async fetchJsonFromContentServer(relativeUrl: string, options?: RequestOptions): Promise<any> {
    const contentServerUrl = await this.getContentServerUrl()
    return (await this.fetcher.fetch(contentServerUrl + this.slash(relativeUrl), options)).json()
  }

  async fetchBufferFromContentServer(relativeUrl: string, options?: RequestOptions): Promise<Buffer> {
    const contentServerUrl = await this.getContentServerUrl()

    return (await this.fetcher.fetch(contentServerUrl + this.slash(relativeUrl), options)).buffer()
  }

  private slash(url: string): string {
    return url.startsWith('/') ? url : '/' + url
  }
}
