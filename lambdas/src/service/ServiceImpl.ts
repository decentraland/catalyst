import { Environment, EnvironmentConfig } from '../Environment'
import { LambdasService, ServerStatus } from './Service'

export class ServiceImpl implements LambdasService {
  constructor(private readonly env: Environment) {}

  getStatus(): Promise<ServerStatus> {
    return Promise.resolve({
      version: '1.0',
      currentTime: Date.now(),
      contentServerUrl: this.env.getConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS),
      commitHash: this.env.getConfig(EnvironmentConfig.COMMIT_HASH),
      catalystVersion: this.env.getConfig(EnvironmentConfig.CATALYST_VERSION)
    })
  }
}
