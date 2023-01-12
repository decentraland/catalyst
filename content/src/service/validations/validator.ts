import {
  ContentValidatorComponents,
  createValidator as validator,
  ExternalCalls,
  SubGraphs,
  Validator as IValidatorComponent,
  L1Checker,
  L2Checker
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
  loadTree
} from '@dcl/block-indexer'
import { ContractFactory, HTTPProvider, RequestManager } from 'eth-connect'
import {
  checkerAbi,
  checkerContracts,
  collectionFactoryContracts,
  landContracts,
  thirdPartyContracts
} from '@dcl/catalyst-contracts'

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

// type CheckerContracts = {
//   landContractAddress: string
//   stateContractAddress: string
//   checkerContractAddress: string
// }

// async function createChecker(ethereumProvider: HTTPProvider, contracts: CheckerContracts): Promise<Checker> {
//   const factory = new ContractFactory(new RequestManager(ethereumProvider), checkerAbi)
//   const checker = (await factory.at(contracts.checkerContractAddress)) as any

//   return {
//     checkLAND: (ethAddress: string, x: number, y: number, block: number) => {
//       return checker.checkLAND(ethAddress, contracts.landContractAddress, contracts.stateContractAddress, x, y, block)
//     }
//   }
// }

async function createL1Checker(provider: HTTPProvider, network: string): Promise<L1Checker> {
  const factory = new ContractFactory(new RequestManager(provider), checkerAbi)
  const checker = (await factory.at(checkerContracts[network])) as any
  // const checker = new ethers.Contract(
  //   checkerContracts[network],
  //   checkerAbi,
  //   provider
  // ) as any as ICheckerContract
  return {
    checkLAND(ethAddress: string, parcels: [number, number][], block: number): Promise<boolean[]> {
      const contracts = landContracts[network]
      return Promise.all(
        parcels.map(([x, y]) =>
          checker.checkLAND(ethAddress, contracts.landContractAddress, contracts.stateContractAddress, x, y, {
            blockTag: block
          })
        )
      )
    }
  }
}

async function createL2Checker(provider: HTTPProvider, network: string): Promise<L2Checker> {
  const factory = new ContractFactory(new RequestManager(provider), checkerAbi)
  const checker = (await factory.at(checkerContracts[network])) as any
  // const checker = new ethers.Contract(
  //   checkerContracts[network],
  //   checkerAbi,
  //   multicallProvider
  // ) as any as ICheckerContract

  const { v2, v3 } = collectionFactoryContracts[network]

  const factories = [v2, v3]

  return {
    async validateWearables(
      ethAddress: string,
      contractAddress: string,
      assetId: string,
      hash: string,
      block: number
    ): Promise<boolean> {
      return checker.validateWearables(ethAddress, factories, contractAddress, assetId, hash, { blockTag: block })
    },
    validateThirdParty(ethAddress: string, tpId: string, root: Buffer, block: number): Promise<boolean> {
      const registry = thirdPartyContracts[network]
      return checker.validateThirdParty(ethAddress, registry, tpId, new Uint8Array(root), {
        blockTag: block
      })
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
  const l1BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics: components.metrics,
      logs: components.logs,
      ethereumProvider: createCachingEthereumProvider(l1EthereumProvider)
    }),
    metrics: components.metrics,
    logs: components.logs
  })
  const l2BlockSearch = createAvlBlockSearch({
    blockRepository: createBlockRepository({
      metrics: components.metrics,
      logs: components.logs,
      ethereumProvider: createCachingEthereumProvider(l2EthereumProvider)
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
  const l1Network: string = components.env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = l1Network === 'mainnet' ? 'polygon' : 'mumbai'

  await warmUpCache(l1BlockSearch.tree, l1Network)
  await warmUpCache(l2BlockSearch.tree, l2Network)

  return {
    L1: {
      checker: await createL1Checker(components.ethereumProvider, l1Network),
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
      checker: await createL2Checker(components.maticProvider, l2Network),
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
