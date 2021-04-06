import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { TheGraphClient } from './TheGraphClient'

export class TheGraphClientFactory {
  static create(env: Environment): TheGraphClient {
    const collectionsSubgraph: string = env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
    const maticCollectionsSubgraph: string = env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
    const ensSubgraph: string = env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL)
    return new TheGraphClient(
      { collectionsSubgraph, maticCollectionsSubgraph, ensSubgraph },
      env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)
    )
  }
}
