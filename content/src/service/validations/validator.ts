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
import {
  AvlTree,
  BlockInfo,
  createAvlBlockSearch,
  createBlockRepository,
  createCachingEthereumProvider,
  EthereumProvider,
  saveTree
} from '@dcl/block-indexer'
import { HTTPProvider, RequestManager } from 'eth-connect'

const createEthereumProvider = (httpProvider: HTTPProvider): EthereumProvider => {
  const reqMan = new RequestManager(httpProvider)
  return {
    getBlockNumber: async (): Promise<number> => {
      return (await reqMan.eth_blockNumber()) as number
    },
    getBlock: async (block: number): Promise<{ timestamp: string | number }> => {
      return await reqMan.eth_getBlockByNumber(block, false)
    }
  }
}

export async function createSubGraphsComponent(
  components: Pick<AppComponents, 'env' | 'logs' | 'metrics' | 'fetcher' | 'ethereumProvider' | 'maticProvider'>
): Promise<SubGraphs> {
  const config: IConfigComponent = createConfigComponent({}) // TODO Get config from higher level
  const baseComponents = { config, fetch: components.fetcher, metrics: components.metrics, logs: components.logs }

  const l1EthereumProvider: EthereumProvider = createEthereumProvider(components.ethereumProvider)
  const l2EthereumProvider: EthereumProvider = createEthereumProvider(components.maticProvider)
  const l1BlockSearch = createAvlBlockSearch(createBlockRepository(createCachingEthereumProvider(l1EthereumProvider)))
  const l2BlockSearch = createAvlBlockSearch(createBlockRepository(createCachingEthereumProvider(l2EthereumProvider)))

  const converter: (k: number, v: BlockInfo) => any[] = (k, v) => [k, v.block]
  const callback = (tree: AvlTree<number, BlockInfo>, networkName: string) => async () => {
    console.log(`saving snapshots for ${networkName}`)
    const start = new Date().getTime()
    try {
      await saveTree(tree, `tree-export-${networkName}-${start}.csv`, converter)
    } finally {
      console.log(`saving snapshot for ${networkName} took ${new Date().getTime() - start} ms.`)
    }
  }
  setInterval(callback(l1BlockSearch.tree, 'l1'), 60 * 60_000) // Every hour
  setInterval(callback(l2BlockSearch.tree, 'l2'), 60 * 60_000) // Every hour

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
    },
    l1BlockSearch,
    l2BlockSearch
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
  components: Pick<ContentValidatorComponents, 'config' | 'externalCalls' | 'logs' | 'theGraphClient' | 'subGraphs'>
): IValidatorComponent {
  return validator(components)
}
