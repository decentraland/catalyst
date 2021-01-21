import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { WearablesOwnership } from './WearablesOwnership'

export class WearablesOwnershipFactory {
  static create(env: Environment): WearablesOwnership {
    return new WearablesOwnership(
      env.getConfig(EnvironmentConfig.COLLECTIONS_PROVIDER_URL),
      env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER),
      env.getConfig(EnvironmentConfig.PROFILE_WEARABLES_CACHE_MAX),
      env.getConfig(EnvironmentConfig.PROFILE_WEARABLES_CACHE_TIMEOUT)
    )
  }
}
