import {
  AvlTree,
  BlockInfo,
  EthereumProvider,
  createAvlBlockSearch,
  createBlockRepository,
  createCachingEthereumProvider,
  loadTree
} from '@dcl/block-indexer'
import { l1Contracts } from '@dcl/catalyst-contracts'
import { streamToBuffer } from '@dcl/catalyst-storage/dist/content-item'
import {
  DeploymentToValidate,
  ExternalCalls,
  OK,
  TokenAddresses,
  ValidateFn,
  createValidator
} from '@dcl/content-validator'
import { createAccessValidateFn } from '@dcl/content-validator/dist/validations/access'
import { createOnChainAccessCheckValidateFns } from '@dcl/content-validator/dist/validations/access/on-chain'
import { createOnChainClient } from '@dcl/content-validator/dist/validations/access/on-chain/client'
import { createSubgraphAccessCheckValidateFns } from '@dcl/content-validator/dist/validations/access/subgraph'
import { createTheGraphClient } from '@dcl/content-validator/dist/validations/access/subgraph/the-graph-client'
import { Authenticator } from '@dcl/crypto'
import { createSubgraphComponent } from '@well-known-components/thegraph-component'
import RequestManager, { HTTPProvider } from 'eth-connect'
import { EnvironmentConfig } from '../../Environment'
import { createItemChecker, createL1Checker, createL2Checker } from '../../logic/checker'
import { AppComponents } from '../../types'
import { createThirdPartyItemChecker } from '../../logic/third-party-item-checker'
import { createThirdPartyContractRegistry } from '../../logic/third-party-contract-registry'
import { hashV0, hashV1 } from '@dcl/hashing'
import { Readable } from 'stream'

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
  components: Pick<AppComponents, 'storage' | 'authenticator' | 'env' | 'logs'>
): Promise<ExternalCalls> {
  async function calculateFilesHashes(
    files: Map<string, Uint8Array>
  ): Promise<Map<string, { calculatedHash: string; buffer: Uint8Array }>> {
    const resultMap = new Map<string, { calculatedHash: string; buffer: Uint8Array }>()

    for (const [key, value] of files.entries()) {
      const hashGenerationFn = key.startsWith('Qm') ? hashV0 : hashV1
      const readableContent = Readable.from(value)
      const calculatedHash = await hashGenerationFn(readableContent)
      resultMap.set(key, { calculatedHash, buffer: value })
    }

    return resultMap
  }

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
      components.authenticator.validateSignature(entityId, auditInfo.authChain, timestamp),
    calculateFilesHashes
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
  components: Pick<AppComponents, 'env' | 'metrics' | 'externalCalls' | 'logs'>,
  l1Provider: HTTPProvider,
  l2Provider: HTTPProvider
): Promise<ValidateFn> {
  const { env, metrics, logs, externalCalls } = components
  const logger = logs.getLogger('OnChainValidator')
  const l1Network: 'mainnet' | 'sepolia' = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = l1Network === 'mainnet' ? 'polygon' : 'amoy'

  const l1Checker = await createL1Checker(l1Provider, l1Network)
  const l2Checker = await createL2Checker(l2Provider, l2Network)
  const l1ItemChecker = await createItemChecker(logs, l1Provider)
  const l2ItemChecker = await createItemChecker(logs, l2Provider)

  const storageRoot = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER) as string
  const l1ThirdPartyContractRegistry = await createThirdPartyContractRegistry(logs, l1Provider, l1Network, storageRoot)
  const l2ThirdPartyContractRegistry = await createThirdPartyContractRegistry(logs, l2Provider, l2Network, storageRoot)
  const l1ThirdPartyItemChecker = await createThirdPartyItemChecker(logs, l1Provider, l1ThirdPartyContractRegistry)
  const l2ThirdPartyItemChecker = await createThirdPartyItemChecker(logs, l2Provider, l2ThirdPartyContractRegistry)

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
      logger.debug(`loading snapshot for ${networkName} took ${new Date().getTime() - start} ms.`)
    } catch (e) {
      logger.warn(`failed to load cache file ${file}`, e.toString())
    }
  }
  await warmUpCache(l1BlockSearch.tree, l1Network)
  await warmUpCache(l2BlockSearch.tree, l2Network)

  const L1 = {
    checker: l1Checker,
    collections: l1ItemChecker,
    thirdParty: l1ThirdPartyItemChecker,
    blockSearch: l1BlockSearch
  }

  const L2 = {
    checker: l2Checker,
    collections: l2ItemChecker,
    thirdParty: l2ThirdPartyItemChecker,
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
  components: Pick<AppComponents, 'env' | 'metrics' | 'config' | 'externalCalls' | 'logs' | 'fetcher'>
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

  const network: 'mainnet' | 'sepolia' = components.env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const contracts = l1Contracts[network]
  const tokenAddresses: TokenAddresses = {
    land: contracts.land,
    estate: contracts.state
  }

  const validateFns = createSubgraphAccessCheckValidateFns({
    logs,
    externalCalls,
    theGraphClient: createTheGraphClient({ logs, subGraphs }),
    subGraphs,
    tokenAddresses
  })

  return createValidator({
    logs,
    externalCalls,
    accessValidateFn: createAccessValidateFn({ externalCalls }, validateFns)
  })
}
