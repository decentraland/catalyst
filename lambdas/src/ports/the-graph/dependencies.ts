import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { IConfigComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createSubgraphComponent } from '@well-known-components/thegraph-component'
import { Environment, EnvironmentConfig } from '../../Environment'
import { metricsComponent } from '../../metrics'
import { SubGraphs } from './types'

async function getSubgraphSubcomponents(env: Environment): Promise<{
  config: IConfigComponent
  fetch: IFetchComponent
  logs: ILoggerComponent
  metrics: any
}> {
  const config = createConfigComponent({
    LOG_LEVEL: env.getConfig(EnvironmentConfig.LOG_LEVEL)
  })
  const fetch = createFetchComponent()
  const logs = await createLogComponent({ config })
  return {
    config,
    fetch,
    logs,
    metrics: metricsComponent
  }
}

export async function createTheGraphDependencies(
  env: Environment
): Promise<{ subgraphs: SubGraphs; log: ILoggerComponent }> {
  const subgraphsComponents = await getSubgraphSubcomponents(env)
  const collectionsSubgraph = await createSubgraphComponent(
    subgraphsComponents,
    env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
  )
  const maticCollectionsSubgraph = await createSubgraphComponent(
    subgraphsComponents,
    env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
  )
  const ensSubgraph = await createSubgraphComponent(
    subgraphsComponents,
    env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL)
  )
  const thirdPartyRegistrySubgraph = await createSubgraphComponent(
    subgraphsComponents,
    env.getConfig(EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL)
  )

  return {
    subgraphs: {
      collectionsSubgraph,
      maticCollectionsSubgraph,
      ensSubgraph,
      thirdPartyRegistrySubgraph
    },
    log: subgraphsComponents.logs
  }
}
