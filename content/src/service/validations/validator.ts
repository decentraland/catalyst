import {
  ContentValidatorComponents,
  createValidator as validator,
  ExternalCalls,
  SubGraphs,
  Validator as IValidatorComponent
} from '@dcl/content-validator'
import { Authenticator } from '@dcl/crypto'
import { EnvironmentConfig } from '../../Environment'
import { streamToBuffer } from '../../ports/contentStorage/contentStorage'
import { AppComponents } from '../../types'
import { createSubgraphComponent } from '@well-known-components/thegraph-component'
import { IConfigComponent } from '@well-known-components/interfaces'
import { createConfigComponent } from '@well-known-components/env-config-provider'

export async function createSubGraphsComponent(
  components: Pick<AppComponents, 'env' | 'logs' | 'metrics' | 'fetcher'>
): Promise<SubGraphs> {
  const config: IConfigComponent = createConfigComponent({}) // TODO Get config from higher level
  const baseComponents = { config, fetch: components.fetcher, metrics: components.metrics, logs: components.logs }
  return {
    L1: {
      landManager: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL)
      ),
      blocks: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.BLOCKS_L1_SUBGRAPH_URL)
      ),
      collections: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
      ),
      ensOwner: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL)
      )
    },
    L2: {
      blocks: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.BLOCKS_L2_SUBGRAPH_URL)
      ),
      collections: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
      ),
      thirdPartyRegistry: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL)
      )
    }
  }
}

export async function createExternalCalls(
  components: Pick<AppComponents, 'storage' | 'catalystFetcher' | 'authenticator' | 'env' | 'logs'>
): Promise<ExternalCalls> {
  return {
    isContentStoredAlready: (hashes) => components.storage.existMultiple(hashes),
    fetchContentFileSize: async (hash) => {
      const maybeFile = await components.storage.retrieve(hash)
      if (maybeFile) {
        const stream = await maybeFile.asStream()
        const buffer = await streamToBuffer(stream)
        return buffer.byteLength
      }
      return undefined
    },
    ownerAddress: (auditInfo) => Authenticator.ownerAddress(auditInfo.authChain),
    isAddressOwnedByDecentraland: (address: string) => components.authenticator.isAddressOwnedByDecentraland(address),
    validateSignature: (entityId, auditInfo, timestamp) =>
      components.authenticator.validateSignature(entityId, auditInfo.authChain, timestamp)
  }
}

export function createValidator(
  components: Pick<ContentValidatorComponents, 'externalCalls' | 'logs' | 'theGraphClient' | 'subGraphs'>
): IValidatorComponent {
  return validator(components)
}
