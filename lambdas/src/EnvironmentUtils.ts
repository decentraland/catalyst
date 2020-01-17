import { Environment, EnvironmentConfig } from "./Environment"

export function baseContentServerUrl(env: Environment): string {
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