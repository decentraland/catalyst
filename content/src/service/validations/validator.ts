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
  loadTree,
  EthereumProvider
} from '@dcl/block-indexer'
import { ethers } from 'ethers'
import { providers } from '@0xsequence/multicall'
import {
  checkerAbi,
  checkerContracts,
  collectionFactoryContracts,
  landContracts,
  registrarContracts,
  thirdPartyContracts
} from '@dcl/catalyst-contracts'
import { IWeb3Component } from 'src/ports/web3'

export type ICheckerContract = {
  checkLAND(
    ethAddress: string,
    landAddress: string,
    stateAddress: string,
    x: number,
    y: number,
    options: { blockTag: number }
  ): Promise<boolean>

  checkName(ethAddress: string, registrar: string, name: string, options: { blockTag: number }): Promise<boolean>

  validateWearables(
    ethAddress: string,
    factories: string[],
    contractAddress: string,
    assetId: string,
    hash: string,
    options: { blockTag: number }
  ): Promise<boolean>

  validateThirdParty(
    ethAddress: string,
    registry: string,
    tpId: string,
    root: Uint8Array,
    options: { blockTag: number }
  ): Promise<boolean>
}

function createCheckerContract(provider: ethers.providers.Provider, network: string): ICheckerContract {
  const multicallProvider = new providers.MulticallProvider(provider)
  const contract = new ethers.Contract(checkerContracts[network], checkerAbi, multicallProvider)
  return contract as any
}

async function createL1Checker(web3: IWeb3Component, network: string): Promise<L1Checker> {
  let checker: ICheckerContract | undefined = undefined
  function getChecker() {
    if (!checker) {
      checker = createCheckerContract(web3.getL1EthersProvider(), network)
    }
    return checker
  }
  return {
    checkLAND(ethAddress: string, parcels: [number, number][], block: number): Promise<boolean[]> {
      const checker = getChecker()
      const contracts = landContracts[network]
      return Promise.all(
        parcels.map(([x, y]) =>
          checker.checkLAND(ethAddress, contracts.landContractAddress, contracts.stateContractAddress, x, y, {
            blockTag: block
          })
        )
      )
    },
    checkNames(ethAddress: string, names: string[], block: number): Promise<boolean[]> {
      const checker = getChecker()
      const registrar = registrarContracts[network]

      return Promise.all(names.map((name) => checker.checkName(ethAddress, registrar, name, { blockTag: block })))
    }
  }
}

async function createL2Checker(web3: IWeb3Component, network: string): Promise<L2Checker> {
  let checker: ICheckerContract | undefined = undefined
  function getChecker() {
    if (!checker) {
      checker = createCheckerContract(web3.getL2EthersProvider(), network)
    }
    return checker
  }

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
      const checker = getChecker()
      return checker.validateWearables(ethAddress, factories, contractAddress, assetId, hash, { blockTag: block })
    },
    validateThirdParty(ethAddress: string, tpId: string, root: Buffer, block: number): Promise<boolean> {
      const checker = getChecker()
      const registry = thirdPartyContracts[network]
      return checker.validateThirdParty(ethAddress, registry, tpId, new Uint8Array(root), { blockTag: block })
    }
  }
}

export async function createSubGraphsComponent(
  components: Pick<AppComponents, 'env' | 'logs' | 'metrics' | 'fetcher' | 'web3'>
): Promise<SubGraphs> {
  const config: IConfigComponent = createConfigComponent({}) // TODO Get config from higher level
  const baseComponents = { config, fetch: components.fetcher, metrics: components.metrics, logs: components.logs }

  const l1Network: string = components.env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = l1Network === 'mainnet' ? 'polygon' : 'mumbai'

  const l1EthereumProvider: EthereumProvider = {
    getBlockNumber: (): Promise<number> => {
      return components.web3.getL1EthersProvider().getBlockNumber()
    },
    getBlock: async (block: number): Promise<{ timestamp: string | number }> => {
      return components.web3.getL1EthersProvider().getBlock(block)
    }
  }
  const l2EthereumProvider: EthereumProvider = {
    getBlockNumber: (): Promise<number> => {
      return components.web3.getL2EthersProvider().getBlockNumber()
    },
    getBlock: async (block: number): Promise<{ timestamp: string | number }> => {
      return components.web3.getL2EthersProvider().getBlock(block)
    }
  }
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
  await warmUpCache(l1BlockSearch.tree, l1Network)
  await warmUpCache(l2BlockSearch.tree, l2Network)

  return {
    L1: {
      checker: await createL1Checker(components.web3, l1Network),
      collections: await createSubgraphComponent(
        baseComponents,
        components.env.getConfig(EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL)
      )
    },
    L2: {
      checker: await createL2Checker(components.web3, l2Network),
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
