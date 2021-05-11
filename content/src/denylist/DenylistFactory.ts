import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { ActiveDenylist } from './ActiveDenylist'
import { Denylist } from './Denylist'
import { DummyDenylist } from './DummyDenylist'

export class DenylistFactory {
  static create(env: Environment): Denylist {
    if (env.getConfig(EnvironmentConfig.DISABLE_DENYLIST)) {
      return new DummyDenylist()
    }

    return new ActiveDenylist(
      env.getBean(Bean.REPOSITORY),
      env.getBean(Bean.AUTHENTICATOR),
      env.getBean(Bean.CONTENT_CLUSTER),
      env.getConfig(EnvironmentConfig.ETH_NETWORK)
    )
  }
}
