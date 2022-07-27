import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { EmotesOwnership } from './EmotesOwnership'

export class EmotesOwnershipFactory {
  static create(env: Environment): EmotesOwnership {
    return new EmotesOwnership(
      env.getBean(Bean.THE_GRAPH_CLIENT),
      env.getConfig(EnvironmentConfig.PROFILE_WEARABLES_CACHE_MAX),
      env.getConfig(EnvironmentConfig.PROFILE_WEARABLES_CACHE_TIMEOUT)
    )
  }
}
