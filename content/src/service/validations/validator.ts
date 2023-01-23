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
  loadTree
} from '@dcl/block-indexer'

export async function createSubGraphsComponent(
  components: Pick<
    AppComponents,
    'env' | 'logs' | 'metrics' | 'fetcher' | 'l1EthersProvider' | 'l2EthersProvider' | 'l1Checker' | 'l2Checker'
  >
): Promise<SubGraphs> {
  const config: IConfigComponent = createConfigComponent({}) // TODO Get config from higher level
  const baseComponents = { config, fetch: components.fetcher, metrics: components.metrics, logs: components.logs }

  const l1Network: string = components.env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = l1Network === 'mainnet' ? 'polygon' : 'mumbai'

  const l1BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics: components.metrics,
      logs: components.logs,
      ethereumProvider: createCachingEthereumProvider(components.l1EthersProvider)
    }),
    metrics: components.metrics,
    logs: components.logs
  })
  const l2BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics: components.metrics,
      logs: components.logs,
      ethereumProvider: createCachingEthereumProvider(components.l2EthersProvider)
    }),
    metrics: components.metrics,
    logs: components.logs
  })

  const converter: (row: any[]) => { key: number; value: BlockInfo } = (row) => ({
    key: parseInt(row[0]),
    value: {
      timestamp: row[0],
      block: parseInt(row[1])
    }
  })
  const warmUpCache = async (tree: AvlTree<number, BlockInfo>, networkName: string): Promise<void> => {
    const start = new Date().getTime()
    const file = `blocks-cache-${networkName}.csv`
    try {
      await loadTree(tree, file, converter)
      console.log(`loading snapshot for ${networkName} took ${new Date().getTime() - start} ms.`)
    } catch (e) {
      console.log(`failed to load cache file ${file}`, e.toString())
    }
  }
  await warmUpCache(l1BlockSearch.tree, l1Network)
  await warmUpCache(l2BlockSearch.tree, l2Network)

  return {
    L1: {
      checker: components.l1Checker,
      collections: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
      )
    },
    L2: {
      checker: components.l2Checker,
      collections: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
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
