import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createLogComponent } from '@well-known-components/logger'
import { createSubgraphComponent } from '@well-known-components/thegraph-component'
import { Environment, EnvironmentConfig } from '../Environment'
import { metricsComponent } from '../metrics'
import { TheGraphClient } from './TheGraphClient'

export class TheGraphClientFactory {
  static async create(env: Environment): Promise<TheGraphClient> {
    const config = createConfigComponent({
      LOG_LEVEL: env.getConfig(EnvironmentConfig.LOG_LEVEL)
    })
    const baseComponents = {
      config,
      fetch: createFetchComponent(),
      metrics: metricsComponent,
      logs: await createLogComponent({ config })
    }

    const collectionsSubgraph = await createSubgraphComponent(
      baseComponents,
      env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
    )
    const maticCollectionsSubgraph = await createSubgraphComponent(
      baseComponents,
      env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
    )
    const ensSubgraph = await createSubgraphComponent(
      baseComponents,
      env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL)
    )
    const thirdPartyRegistrySubgraph = await createSubgraphComponent(
      baseComponents,
      env.getConfig(EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL)
    )
    return new TheGraphClient({
      collectionsSubgraph,
      maticCollectionsSubgraph,
      ensSubgraph,
      thirdPartyRegistrySubgraph
    })
  }
}
