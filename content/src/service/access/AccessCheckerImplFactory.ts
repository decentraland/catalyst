import { Bean, Environment, EnvironmentConfig } from '@katalyst/content/Environment'
import { AccessCheckerImpl } from './AccessCheckerImpl'

export class AccessCheckerImplFactory {
  static create(env: Environment): AccessCheckerImpl {
    return new AccessCheckerImpl({
      authenticator: env.getBean(Bean.AUTHENTICATOR),
      fetcher: env.getBean(Bean.FETCHER),
      landManagerSubgraphUrl: env.getConfig(EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL),
      collectionsL1SubgraphUrl: env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL),
      collectionsL2SubgraphUrl: env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
    })
  }
}
