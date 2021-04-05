import { Bean, Environment, EnvironmentConfig } from '@katalyst/content/Environment'
import { AccessCheckerImpl } from './AccessCheckerImpl'

export class AccessCheckerImplFactory {
  static create(env: Environment): AccessCheckerImpl {
    return new AccessCheckerImpl(
      env.getBean(Bean.AUTHENTICATOR),
      env.getBean(Bean.FETCHER),
      env.getConfig(EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL),
      env.getConfig(EnvironmentConfig.DCL_COLLECTIONS_ACCESS_URL)
    )
  }
}
