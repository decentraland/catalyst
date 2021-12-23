import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { AccessCheckerImpl } from './AccessCheckerImpl'

export class AccessCheckerImplFactory {
  static create(
    components: Pick<AppComponents, 'authenticator' | 'catalystFetcher' | 'env' | 'logs'>
  ): AccessCheckerImpl {
    const { env } = components
    return new AccessCheckerImpl({
      authenticator: components.authenticator,
      fetcher: components.catalystFetcher,
      logs: components.logs,
      landManagerSubgraphUrl: env.getConfig(EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL),
      collectionsL1SubgraphUrl: env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL),
      collectionsL2SubgraphUrl: env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL),
      blocksL1SubgraphUrl: env.getConfig(EnvironmentConfig.BLOCKS_L1_SUBGRAPH_URL),
      blocksL2SubgraphUrl: env.getConfig(EnvironmentConfig.BLOCKS_L2_SUBGRAPH_URL)
    })
  }
}
