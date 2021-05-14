import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { ActiveDenylist } from './ActiveDenylist'
import { DeactivatedDenylist } from './DeactivatedDenylist'
import { Denylist } from './Denylist'

export class DenylistFactory {
  static create(env: Environment): Denylist {
    if (env.getConfig(EnvironmentConfig.DISABLE_DENYLIST)) {
      return new DeactivatedDenylist()
    }

    return new ActiveDenylist(
      env.getBean(Bean.REPOSITORY),
      env.getBean(Bean.AUTHENTICATOR),
      env.getBean(Bean.CONTENT_CLUSTER),
      env.getConfig(EnvironmentConfig.ETH_NETWORK)
    )
  }
}
