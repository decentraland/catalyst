import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { EnsOwnership } from './EnsOwnership'

export class EnsOwnershipFactory {
  static create(env: Environment): EnsOwnership {
    return new EnsOwnership(
      env.getBean(Bean.THE_GRAPH_CLIENT),
      env.getConfig(EnvironmentConfig.PROFILE_NAMES_CACHE_MAX),
      env.getConfig(EnvironmentConfig.PROFILE_NAMES_CACHE_TIMEOUT)
    )
  }
}
