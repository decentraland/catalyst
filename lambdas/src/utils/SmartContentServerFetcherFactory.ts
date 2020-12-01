import { Environment, EnvironmentConfig } from "../Environment"
import { SmartContentServerFetcher } from "./SmartContentServerFetcher"

export class SmartContentServerFetcherFactory {

    static create(env: Environment): SmartContentServerFetcher {
        const externalUrl = SmartContentServerFetcherFactory.baseContentServerUrl(env)
        return new SmartContentServerFetcher(externalUrl)
    }

    private static baseContentServerUrl(env: Environment): string {
        let configAddress: string = env.getConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
        configAddress = configAddress.toLowerCase()
        if (!configAddress.startsWith('http')) {
            configAddress = 'http://' + configAddress
        }
        while(configAddress.endsWith('/')) {
            configAddress = configAddress.slice(0,-1)
        }
        return configAddress
    }
}