import log4js from "log4js"
import fetch from "node-fetch"

/**
 * This fetcher tries to use the internal docker network to connect lambdas with the content server.
 * If it can't, then it will try to contact it externally
 */
export class SmartContentServerFetcher {

    private static INTERNAL_CONTENT_SERVER_URL: string = `http://content-server:6969`
    private static LOGGER = log4js.getLogger('SmartContentServerFetcher');

    private contentServerUrl: string | undefined

    constructor(private readonly externalContentServerUrl: string) { }

    async getContentServerUrl(): Promise<string> {
        if (!this.contentServerUrl) {
            try {
                const response = await fetch(`${SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL}/status`)
                if (response.ok) {
                    SmartContentServerFetcher.LOGGER.info("Will use the internal content server url")
                    this.contentServerUrl = SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL
                    return this.contentServerUrl
                }
            } catch { }
            SmartContentServerFetcher.LOGGER.info("Will use the external content server url")
            this.contentServerUrl = this.externalContentServerUrl
        }
        return this.contentServerUrl
    }

    getExternalContentServerUrl(): string {
        return this.externalContentServerUrl
    }

}