import fetch from "node-fetch"
import log4js from "log4js"
import { Environment, EnvironmentConfig } from "./Environment"

/**
 * This fetcher tries to use the internal docker network to connect lambdas with the content server.
 * If it can't, then it will try to contact it externally
 */
export class SmartContentServerFetcher {

    private static INTERNAL_CONTENT_SERVER_URL: string = `http://content-server:6969`
    private static LOGGER = log4js.getLogger('SmartContentServerFetcher');

    private constructor(
        private readonly contentServerUrl: string,
        private readonly externalContentServerUrl: string) { }

    static async build(env: Environment): Promise<SmartContentServerFetcher> {
        const externalUrl = SmartContentServerFetcher.baseContentServerUrl(env)
        try {
            const response = await fetch(`${SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL}/status`)
            if (response.ok) {
                SmartContentServerFetcher.LOGGER.info("Will use the internal content server url")
                return new SmartContentServerFetcher(SmartContentServerFetcher.INTERNAL_CONTENT_SERVER_URL, externalUrl)
            }
        } catch { }
        SmartContentServerFetcher.LOGGER.info("Will use the external content server url")
        return new SmartContentServerFetcher(externalUrl, externalUrl)
    }

    getContentServerUrl(): string {
        return this.contentServerUrl
    }

    getExternalContentServerUrl(): string {
        return this.externalContentServerUrl
    }

    private static baseContentServerUrl(env: Environment): string {
        let configAddress: string = env.getConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
        configAddress = configAddress.toLocaleLowerCase()
        if (!configAddress.startsWith('http')) {
            configAddress = 'http://' + configAddress
        }
        while(configAddress.endsWith('/')) {
            configAddress = configAddress.slice(0,-1)
        }
        return configAddress
    }
}