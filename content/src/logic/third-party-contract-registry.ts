import fs from 'fs'
import path from 'path'

import RequestManager, { ContractFactory, HTTPProvider, toData } from 'eth-connect'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { ContractAddress } from '@dcl/schemas'
import { erc1155Abi, erc721Abi, sendSingle } from './contract-helpers'

export enum ContractType {
  ERC721 = 'erc721',
  ERC1155 = 'erc1155',
  UNKNOWN = 'unknown'
}

export function loadCacheFile(file: string): Record<string, ContractType> {
  try {
    console.log(file, fs.existsSync(file))
    if (!fs.existsSync(file)) {
      saveCacheFile(file, {})
    }
    const fileContent = fs.readFileSync(file, 'utf-8')
    return JSON.parse(fileContent)
  } catch (_) {
    return {}
  }
}

export function saveCacheFile(file: string, data: any): void {
  const jsonData = JSON.stringify(data, null, 2)
  fs.writeFileSync(file, jsonData, 'utf-8')
}

export type ThirdPartyContractRegistry = {
  isErc721(contractAddress: ContractAddress): boolean
  isErc1155(contractAddress: ContractAddress): boolean
  isUnknown(contractAddress: ContractAddress): boolean
  ensureContractsKnown(contractAddresses: ContractAddress[]): Promise<void>
}

export async function createThirdPartyContractRegistry(
  logs: ILoggerComponent,
  provider: HTTPProvider,
  network: 'mainnet' | 'sepolia' | 'polygon' | 'amoy',
  storageRoot: string
): Promise<ThirdPartyContractRegistry> {
  const logger = logs.getLogger('contract-registry')

  const requestManager = new RequestManager(provider)
  const erc721ContractFactory = new ContractFactory(requestManager, erc721Abi)
  const erc1155ContractFactory = new ContractFactory(requestManager, erc1155Abi)

  const file = path.join(storageRoot, `third-party-contracts-${network}.json`)
  const data: Record<ContractAddress, ContractType> = loadCacheFile(file)
  console.log('data', JSON.stringify(data, null, 2))

  function isErc721(contractAddress: ContractAddress): boolean {
    return data[contractAddress.toLowerCase()] === ContractType.ERC721
  }

  function isErc1155(contractAddress: ContractAddress): boolean {
    return data[contractAddress.toLowerCase()] === ContractType.ERC1155
  }

  function isUnknown(contractAddress: ContractAddress): boolean {
    return data[contractAddress.toLowerCase()] === ContractType.UNKNOWN
  }

  async function checkIfErc721(contractAddress: ContractAddress): Promise<boolean> {
    console.log('checkIfErc721', contractAddress)

    // ERC-721 checks
    const contract: any = await erc721ContractFactory.at(contractAddress)
    try {
      const r = await sendSingle(provider, await contract.ownerOf.toRPCMessage(0))

      console.log('r', r)
      if (r.error?.code === 3) {
        // NFT id doesn't exist, but it is an ERC-721
        return true
      }
      if (!r.result) {
        return false
      }
      console.log('toData', toData(r.result), contract.ownerOf.unpackOutput(toData(r.result)))
      return !!contract.ownerOf.unpackOutput(toData(r.result))
    } catch (_) {
      return false
    }
  }

  async function checkIfErc1155(contractAddress: ContractAddress): Promise<boolean> {
    console.log('checkIfErc1155', contractAddress)

    // ERC-1155 checks
    const contract: any = await erc1155ContractFactory.at(contractAddress)

    try {
      const r = await sendSingle(provider, await contract.balanceOf.toRPCMessage(contract.address, 0))

      console.log('r', r)
      if (!r.result) {
        return false
      }
      return !!contract.balanceOf.unpackOutput(toData(r.result))
    } catch (_) {
      return false
    }
  }

  async function ensureContractsKnown(contractAddresses: ContractAddress[]) {
    const needToFigureOut = contractAddresses
      .map((contractAddress) => contractAddress.toLowerCase())
      .filter((contractAddress) => !data[contractAddress])

    if (needToFigureOut.length > 0) {
      for (const contract of needToFigureOut) {
        if (await checkIfErc1155(contract)) {
          data[contract] = ContractType.ERC1155
        } else if (await checkIfErc721(contract)) {
          data[contract] = ContractType.ERC721
        } else {
          data[contract] = ContractType.UNKNOWN
        }
      }

      logger.debug('Updating contract cache', { file, newContracts: needToFigureOut.join(', ') })
      saveCacheFile(file, data)
    }
  }

  return {
    isErc721,
    isErc1155,
    isUnknown,
    ensureContractsKnown
  }
}
