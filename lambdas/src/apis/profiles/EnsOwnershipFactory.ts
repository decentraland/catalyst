import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { EnsOwnership } from './EnsOwnership'

export class EnsOwnershipFactory {
  static create(env: Environment): EnsOwnership {
    return new EnsOwnership(
      env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL),
      env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER),
      env.getConfig(EnvironmentConfig.PROFILE_NAMES_CACHE_MAX),
      env.getConfig(EnvironmentConfig.PROFILE_NAMES_CACHE_TIMEOUT)
    )
  }
}
