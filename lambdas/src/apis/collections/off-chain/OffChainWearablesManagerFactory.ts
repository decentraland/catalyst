import { Bean, Environment, EnvironmentConfig } from '@katalyst/lambdas/Environment'
import { OffChainWearablesManager } from './OffChainWearablesManager'

export class OffChainWearablesManagerFactory {
  static create(env: Environment): OffChainWearablesManager {
    return new OffChainWearablesManager({
      client: env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT),
      refreshTime: env.getConfig(EnvironmentConfig.OFF_CHAIN_WEARABLES_REFRESH_TIME)
    })
  }
}
