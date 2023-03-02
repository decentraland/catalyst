import { streamToBuffer } from '@dcl/catalyst-storage/dist/content-item'
import { createSubgraphComponent } from '@well-known-components/thegraph-component'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { createValidator, DeploymentToValidate, OK, ExternalCalls, ValidateFn } from '@dcl/content-validator'
import { createAccessValidateFn } from '@dcl/content-validator/dist/validations/access'
import { createOnChainAccessCheckValidateFns } from '@dcl/content-validator/dist/validations/access/on-chain'
import { createSubgraphAccessCheckValidateFns } from '@dcl/content-validator/dist/validations/access/subgraph'
import { createOnChainClient } from '@dcl/content-validator/dist/validations/access/on-chain/client'
import { Authenticator } from '@dcl/crypto'
import {
  AvlTree,
  BlockInfo,
  createAvlBlockSearch,
  createBlockRepository,
  createCachingEthereumProvider,
  EthereumProvider,
  loadTree
} from '@dcl/block-indexer'
import RequestManager, { HTTPProvider } from 'eth-connect'
import { createL1Checker, createL2Checker } from '../../logic/checker'
import { createTheGraphClient } from '@dcl/content-validator/dist/validations/access/subgraph/the-graph-client'

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

export async function createIgnoreBlockchainValidator(
  components: Pick<AppComponents, 'logs' | 'externalCalls'>
): Promise<ValidateFn> {
  const { logs, externalCalls } = components

  return createValidator({
    logs,
    externalCalls,
    accessValidateFn: (_d: DeploymentToValidate) => Promise.resolve(OK)
  })
}

export async function createOnChainValidator(
  components: Pick<
    AppComponents,
    'env' | 'metrics' | 'config' | 'externalCalls' | 'logs' | 'l1Provider' | 'l2Provider' | 'fetcher'
  >
): Promise<ValidateFn> {
  const { env, metrics, logs, fetcher, l1Provider, l2Provider, config, externalCalls } = components
  const l1Network: 'mainnet' | 'goerli' = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = l1Network === 'mainnet' ? 'polygon' : 'mumbai'

  const l1Checker = await createL1Checker(l1Provider, l1Network)
  const l2Checker = await createL2Checker(l2Provider, l2Network)

  const l1BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics,
      logs,
      ethereumProvider: createCachingEthereumProvider(createEthereumProvider(l1Provider))
    }),
    metrics,
    logs
  })
  const l2BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics,
      logs,
      ethereumProvider: createCachingEthereumProvider(createEthereumProvider(l2Provider))
    }),
    metrics,
    logs
  })

  const converter: (row: any[]) => { key: number; value: BlockInfo } = (row) => ({
    key: parseInt(row[0]),
    value: {
      timestamp: row[0],
      block: parseInt(row[1])
    }
  })
  async function warmUpCache(tree: AvlTree<number, BlockInfo>, networkName: string): Promise<void> {
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

  const L1 = {
    checker: l1Checker,
    collections: await createSubgraphComponent(
      { config, fetch: fetcher, metrics, logs },
      components.env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
    ),
    blockSearch: l1BlockSearch
  }

  const L2 = {
    checker: l2Checker,
    collections: await createSubgraphComponent(
      { config, fetch: fetcher, metrics, logs },
      components.env.getConfig(EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL)
    ),
    blockSearch: l2BlockSearch
  }

  const validateFns = createOnChainAccessCheckValidateFns({
    logs,
    externalCalls,
    client: createOnChainClient({ logs, L1, L2 }),
    L1,
    L2
  })

  return createValidator({
    logs,
    externalCalls,
    accessValidateFn: createAccessValidateFn({ externalCalls }, validateFns)
  })
}

export async function createSubgraphValidator(
  components: Pick<
    AppComponents,
    'env' | 'metrics' | 'config' | 'externalCalls' | 'logs' | 'l1Provider' | 'l2Provider' | 'fetcher'
  >
): Promise<ValidateFn> {
  const { logs, config, externalCalls } = components
  const baseComponents = { config, fetch: components.fetcher, metrics: components.metrics, logs: components.logs }
  const subGraphs = {
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

  const validateFns = createSubgraphAccessCheckValidateFns({
    logs,
    externalCalls,
    theGraphClient: createTheGraphClient({ logs, subGraphs }),
    subGraphs
  })

  return createValidator({
    logs,
    externalCalls,
    accessValidateFn: createAccessValidateFn({ externalCalls }, validateFns)
  })
}
