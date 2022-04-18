import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { WearablesOwnership } from './WearablesOwnership'

export class WearablesOwnershipFactory {
  static create(env: Environment): WearablesOwnership {
    return new WearablesOwnership(
      env.getBean(Bean.THE_GRAPH_CLIENT),
      env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT),
      env.getConfig(EnvironmentConfig.PROFILE_WEARABLES_CACHE_MAX),
      env.getConfig(EnvironmentConfig.PROFILE_WEARABLES_CACHE_TIMEOUT)
    )
  }
}
