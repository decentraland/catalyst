import { ThirdPartyItemChecker } from '@dcl/content-validator'
import RequestManager, { ContractFactory, HTTPProvider, RPCSendableMessage, toData } from 'eth-connect'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { BlockchainCollectionThirdPartyItem, parseUrn } from '@dcl/urn-resolver'
import { ContractType, ThirdPartyContractRegistry } from './third-party-contract-registry'
import { erc1155Abi, erc721Abi, sendBatch } from './contract-helpers'

type TempData = {
  urn: string
  contract?: string
  nftId?: string
  type?: ContractType
  result?: boolean
}

export async function createThirdPartyItemChecker(
  logs: ILoggerComponent,
  provider: HTTPProvider,
  network: 'mainnet' | 'sepolia' | 'polygon' | 'amoy',
  thirdPartyContractRegistry: ThirdPartyContractRegistry
): Promise<ThirdPartyItemChecker> {
  const logger = logs.getLogger('item-checker')
  const requestManager = new RequestManager(provider)
  const erc721ContractFactory = new ContractFactory(requestManager, erc721Abi)
  const erc1155ContractFactory = new ContractFactory(requestManager, erc1155Abi)

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
    // console.log('allUrn', allUrns)

    // TODO Fetch wearables from DB and check the mappings. If token ids are outside the mappings, return validation error

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
    // console.log('allUrn', allUrns)

    // Ensure all contracts are of a known type, otherwise try to determine it and store it.
    await thirdPartyContractRegistry.ensureContractsKnown(
      Object.values(allUrns)
        .filter((tempData) => !!tempData.contract)
        .map((asset) => asset.contract)
    )

    // Mark as false all contracts that are of unknown type
    Object.values(allUrns)
      .filter((tempData) => !!tempData.contract)
      .forEach((tempData) => {
        if (!tempData.result && thirdPartyContractRegistry.isUnknown(tempData.contract)) {
          tempData.result = false
        }
      })
    // console.log('allUrn', allUrns)

    const filteredAssets: TempData[] = Object.values(allUrns).filter((tempData) => tempData.result === undefined)
    console.log('filteredAssets', filteredAssets)

    const contracts: any = await Promise.all(
      filteredAssets.map((asset) => {
        if (thirdPartyContractRegistry.isErc721(asset.contract!)) {
          return erc721ContractFactory.at(asset.contract!)
        } else if (thirdPartyContractRegistry.isErc1155(asset.contract!)) {
          return erc1155ContractFactory.at(asset.contract!)
        }
        throw new Error('Unknown contract type')
      })
    )
    const batch: RPCSendableMessage[] = await Promise.all(
      contracts.map((contract: any, idx: number) => {
        if (thirdPartyContractRegistry.isErc721(filteredAssets[idx].contract!)) {
          return contract.ownerOf.toRPCMessage(filteredAssets[idx].nftId)
        } else if (thirdPartyContractRegistry.isErc1155(filteredAssets[idx].contract!)) {
          return contract.balanceOf.toRPCMessage(ethAddress, filteredAssets[idx].nftId)
        }
        throw new Error('Unknown contract type')
      })
    )

    const result = await sendBatch(provider, batch)
    // console.log('result', result)

    result.forEach((r: any, idx: number) => {
      if (!r.result) {
        filteredAssets[idx].result = undefined
      }
      const data = toData(r.result)
      if (thirdPartyContractRegistry.isErc721(filteredAssets[idx].contract!)) {
        filteredAssets[idx].result =
          contracts[idx].ownerOf.unpackOutput(data).toLowerCase() === ethAddress.toLowerCase()
      } else if (thirdPartyContractRegistry.isErc1155(filteredAssets[idx].contract!)) {
        filteredAssets[idx].result = contracts[idx].balanceOf.unpackOutput(data) > 0
      }
    })

    // console.log('allUrn', allUrns)
    return itemUrns.map((itemUrn) => allUrns[itemUrn].result)
  }

  return {
    checkThirdPartyItems
  }
}
