import log4js from "log4js"
import { Fetcher, RequestOptions } from "dcl-catalyst-commons";

/**
 * This fetcher tries to use the internal docker network to connect lambdas with the content server.
 * If it can't, then it will try to contact it externally
 */
export class SmartContentServerFetcher extends Fetcher {

    private static INTERNAL_CONTENT_SERVER_URL: string = `http://content-server:6969`
    private static LOGGER = log4js.getLogger('SmartContentServerFetcher');

    private contentServerUrl: string | undefined

    constructor(private readonly externalContentServerUrl: string) {
        super()
    }

    async getContentServerUrl(): Promise<string> {
        if (!this.contentServerUrl) {
            try {
                await this.fetchJson(`${SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL}/status`)
                SmartContentServerFetcher.LOGGER.info("Will use the internal content server url")
                this.contentServerUrl = SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL
                return this.contentServerUrl
            } catch { }
            SmartContentServerFetcher.LOGGER.info("Will use the external content server url")
            this.contentServerUrl = this.externalContentServerUrl
        }
        return this.contentServerUrl
    }

    getExternalContentServerUrl(): string {
        return this.externalContentServerUrl
    }

    async fetchJsonFromContentServer(relativeUrl: string, options?: RequestOptions): Promise<any> {
        const contentServerUrl = await this.getContentServerUrl()
        return this.fetchJson(contentServerUrl + this.slash(relativeUrl), options)
    }

    async fetchBufferFromContentServer(relativeUrl: string, options?: RequestOptions): Promise<Buffer> {
        const contentServerUrl = await this.getContentServerUrl()
        return this.fetchBuffer(contentServerUrl + this.slash(relativeUrl), options)
    }

    private slash(url: string): string {
        return url.startsWith('/') ? url : '/' + url
    }

}