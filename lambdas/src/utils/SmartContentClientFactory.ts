import { Environment, EnvironmentConfig } from '../Environment'
import { SmartContentClient } from './SmartContentClient'

export class SmartContentClientFactory {
  static create(env: Environment): SmartContentClient {
    const externalUrl = SmartContentClientFactory.baseContentServerUrl(env)
    return new SmartContentClient(externalUrl)
  }

  private static baseContentServerUrl(env: Environment): string {
    let configAddress: string = env.getConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    configAddress = configAddress.toLowerCase()
    if (!configAddress.startsWith('http')) {
      configAddress = 'http://' + configAddress
    }
    while (configAddress.endsWith('/')) {
      configAddress = configAddress.slice(0, -1)
    }
    return configAddress
  }
}
