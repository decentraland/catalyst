import fs from 'fs'
import path from 'path'
import { ThirdPartyItemChecker } from '@dcl/content-validator'
import { ContractAddress } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import RequestManager, { ContractFactory, HTTPProvider, RPCSendableMessage, toData } from 'eth-connect'
import { BlockchainCollectionThirdPartyItem, parseUrn } from '@dcl/urn-resolver'
import { erc1155Abi, erc721Abi, sendBatch, sendSingle } from '../../../logic/contract-helpers'
import { AppComponents } from '../../../types'
import { ContractType } from './types'

type TempData = {
  urn: string
  contract?: string
  nftId?: string
  type?: ContractType
  result?: boolean
}

const EMPTY_MESSAGE = '0x'

/**
 * Build a `ThirdPartyItemChecker` bound to a specific chain. Owns a per-network on-disk
 * cache of `contract → ERC type` classifications (previously its own component) so that
 * subsequent ownership checks know whether to issue an `ownerOf` or `balanceOf` RPC.
 *
 * There are two instances per app (L1 + L2), so the per-chain `provider`, `network`, and
 * `storageRoot` are passed in positionally rather than via `AppComponents`.
 */
export async function createThirdPartyItemChecker(
  { logs }: Pick<AppComponents, 'logs'>,
  provider: HTTPProvider,
  network: 'mainnet' | 'sepolia' | 'polygon' | 'amoy',
  storageRoot: string
): Promise<ThirdPartyItemChecker> {
  const logger = logs.getLogger('item-checker')
  const requestManager = new RequestManager(provider)
  const erc721ContractFactory = new ContractFactory(requestManager, erc721Abi)
  const erc1155ContractFactory = new ContractFactory(requestManager, erc1155Abi)

  const contractTypeCacheFile = path.join(storageRoot, `third-party-contracts-${network}.json`)
  const contractTypes: Record<ContractAddress, ContractType> = loadCacheFile(contractTypeCacheFile, logger)

  function isErc721(contractAddress: ContractAddress): boolean {
    return contractTypes[contractAddress.toLowerCase()] === ContractType.ERC721
  }

  function isErc1155(contractAddress: ContractAddress): boolean {
    return contractTypes[contractAddress.toLowerCase()] === ContractType.ERC1155
  }

  function isUnknown(contractAddress: ContractAddress): boolean {
    return contractTypes[contractAddress.toLowerCase()] === ContractType.UNKNOWN
  }

  async function checkIfErc721(contractAddress: ContractAddress): Promise<boolean> {
    const contract: any = await erc721ContractFactory.at(contractAddress)
    try {
      const r = await sendSingle(provider, await contract.ownerOf.toRPCMessage(0))
      // NFT id 0 may not exist, but a revert proves the function exists → still ERC-721.
      if (r.error?.code === 3) return true
      if (!r.result) return false
      return !!contract.ownerOf.unpackOutput(toData(r.result))
    } catch (_) {
      return false
    }
  }

  async function checkIfErc1155(contractAddress: ContractAddress): Promise<boolean> {
    const contract: any = await erc1155ContractFactory.at(contractAddress)
    try {
      const r = await sendSingle(provider, await contract.balanceOf.toRPCMessage(contract.address, 0))
      if (!r.result) return false
      return !!contract.balanceOf.unpackOutput(toData(r.result))
    } catch (_) {
      return false
    }
  }

  async function ensureContractsKnown(contractAddresses: ContractAddress[]): Promise<void> {
    const needToFigureOut = contractAddresses
      .map((contractAddress) => contractAddress.toLowerCase())
      .filter((contractAddress) => !contractTypes[contractAddress])

    if (needToFigureOut.length === 0) return

    for (const contract of needToFigureOut) {
      if (await checkIfErc1155(contract)) {
        contractTypes[contract] = ContractType.ERC1155
      } else if (await checkIfErc721(contract)) {
        contractTypes[contract] = ContractType.ERC721
      } else {
        contractTypes[contract] = ContractType.UNKNOWN
      }
    }

    logger.debug('Updating contract cache', { file: contractTypeCacheFile, newContracts: needToFigureOut.join(', ') })
    saveCacheFile(contractTypeCacheFile, contractTypes)
  }

  async function checkThirdPartyItems(ethAddress: string, itemUrns: string[], block: number): Promise<boolean[]> {
    if (itemUrns.length === 0) {
      logger.debug('No third party items to check')
      return []
    }

    logger.info(`Checking third party items for ${ethAddress} at block ${block}: ${JSON.stringify(itemUrns)}`)

    const allUrns: Record<string, any> = itemUrns.reduce((acc, urn) => {
      acc[urn] = { urn }
      return acc
    }, {} as Record<string, TempData>)

    // Mark as false all urns that cannot be parsed
    for (const urn of itemUrns) {
      const parsed = await parseUrn(urn)
      if (!parsed) {
        allUrns[urn].result = false
      } else {
        const parsed1 = parsed as BlockchainCollectionThirdPartyItem
        allUrns[urn].contract = parsed1.nftContractAddress.toLowerCase()
        allUrns[urn].nftId = parsed1.nftTokenId
      }
    }

    // Ensure all contracts are of a known type, otherwise try to determine it and store it.
    await ensureContractsKnown(
      Object.values(allUrns)
        .filter((tempData) => !!tempData.contract)
        .map((asset) => asset.contract)
    )

    // Mark as false all wearables referencing contracts that are of an unknown type
    Object.values(allUrns)
      .filter((tempData) => !!tempData.contract)
      .forEach((tempData) => {
        if (!tempData.result && isUnknown(tempData.contract)) {
          tempData.result = false
        }
      })

    const filteredAssets: TempData[] = Object.values(allUrns).filter((tempData) => tempData.result === undefined)
    const contracts: any = await Promise.all(
      filteredAssets.map((asset) => {
        if (isErc721(asset.contract!)) {
          return erc721ContractFactory.at(asset.contract!)
        } else if (isErc1155(asset.contract!)) {
          return erc1155ContractFactory.at(asset.contract!)
        }
        throw new Error('Unknown contract type')
      })
    )
    const batch: RPCSendableMessage[] = await Promise.all(
      contracts.map((contract: any, idx: number) => {
        if (isErc721(filteredAssets[idx].contract!)) {
          return contract.ownerOf.toRPCMessage(filteredAssets[idx].nftId, block)
        } else if (isErc1155(filteredAssets[idx].contract!)) {
          return contract.balanceOf.toRPCMessage(ethAddress, filteredAssets[idx].nftId, block)
        }
        throw new Error('Unknown contract type')
      })
    )

    const result = await sendBatch(provider, batch)
    result.forEach((r: any, idx: number) => {
      if (!r.result) {
        filteredAssets[idx].result = false
      } else {
        const data = toData(r.result)
        if (isErc721(filteredAssets[idx].contract!)) {
          filteredAssets[idx].result =
            (data === EMPTY_MESSAGE ? '' : contracts[idx].ownerOf.unpackOutput(data).toLowerCase()) ===
            ethAddress.toLowerCase()
        } else if (isErc1155(filteredAssets[idx].contract!)) {
          filteredAssets[idx].result = (data === EMPTY_MESSAGE ? 0 : contracts[idx].balanceOf.unpackOutput(data)) > 0
        }
      }
    })

    return itemUrns.map((itemUrn) => allUrns[itemUrn].result)
  }

  return {
    checkThirdPartyItems
  }
}

function loadCacheFile(file: string, logger: ILoggerComponent.ILogger): Record<string, ContractType> {
  try {
    if (!fs.existsSync(file)) {
      saveCacheFile(file, {})
    }
    const fileContent = fs.readFileSync(file, 'utf-8')
    return JSON.parse(fileContent)
  } catch (err) {
    // Malformed JSON, missing read permission, etc. We can rebuild the cache from
    // RPC calls, so fall through to an empty cache — but surface the problem so a
    // recurring corruption isn't silent.
    logger.warn('Failed to load third-party contract cache; starting with an empty cache.', {
      file,
      error: err instanceof Error ? err.message : String(err)
    })
    return {}
  }
}

function saveCacheFile(file: string, data: Record<string, ContractType>): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}
