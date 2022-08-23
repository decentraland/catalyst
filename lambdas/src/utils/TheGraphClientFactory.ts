import { Environment, EnvironmentConfig } from '../Environment'
import { TheGraphClient } from './TheGraphClient'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import {
  createSubgraphComponent,
  metricDeclarations as theGraphMetricDeclarations
} from '@well-known-components/thegraph-component'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { createFetchComponent } from '../ports/fetcher'

export class TheGraphClientFactory {
  static async create(env: Environment): Promise<TheGraphClient> {
    const config = createConfigComponent({
      LOG_LEVEL: env.getConfig(EnvironmentConfig.LOG_LEVEL)
    })
    const baseComponents = {
      config,
      fetch: createFetchComponent(),
      metrics: createTestMetricsComponent({ ...theGraphMetricDeclarations }),
      logs: await createLogComponent({ config })
    }

    console.error(baseComponents)

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
      env.getConfig(EnvironmentConfig.THIRD_PARTY_REGISTRY_SUBGRAPH_URL)
    )
    return new TheGraphClient({
      collectionsSubgraph,
      maticCollectionsSubgraph,
      ensSubgraph,
      thirdPartyRegistrySubgraph
    })
  }
}
