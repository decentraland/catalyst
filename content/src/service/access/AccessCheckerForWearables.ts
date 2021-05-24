import { BlockchainCollectionV2Asset, parseUrn } from '@dcl/urn-resolver'
import { Fetcher, Pointer } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'

export class AccessCheckerForWearables {
  private static readonly L1_NETWORKS = ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
  private static readonly L2_NETWORKS = ['matic', 'mumbai']

  constructor(
    private readonly fetcher: Fetcher,
    private readonly collectionsL1SubgraphUrl: string,
    private readonly collectionsL2SubgraphUrl: string,
    private readonly LOGGER: log4js.Logger
  ) {}

  public async checkAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
    const errors: string[] = []

    if (pointers.length != 1) {
      errors.push(`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`)
    } else {
      const pointer: Pointer = pointers[0].toLowerCase()
      const parsed = await this.parseUrnNoFail(pointer)
      if (parsed) {
        const { contractAddress: collection, id: itemId, network } = parsed
        let subgraphUrl: string
        if (AccessCheckerForWearables.L1_NETWORKS.includes(network)) {
          subgraphUrl = this.collectionsL1SubgraphUrl
        } else if (AccessCheckerForWearables.L2_NETWORKS.includes(network)) {
          subgraphUrl = this.collectionsL2SubgraphUrl
        } else {
          errors.push(`Found an unknown network on the urn '${network}'`)
          return errors
        }

        // Check that the address has access
        const hasAccess = await this.checkCollectionAccess(subgraphUrl, collection, itemId, ethAddress)
        if (!hasAccess) {
          errors.push(`The provided Eth Address does not have access to the following wearable: (${pointer})`)
        }
      } else {
        errors.push(
          `Wearable pointers should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${pointer})`
        )
      }
    }
    return errors
  }

  private async parseUrnNoFail(urn: string): Promise<BlockchainCollectionV2Asset | null> {
    try {
      const parsed = await parseUrn(urn)
      if (parsed?.type === 'blockchain-collection-v2-asset') {
        return parsed as BlockchainCollectionV2Asset
      }
    } catch {}
    return null
  }

  private async checkCollectionAccess(
    subgraphUrl: string,
    collection: string,
    itemId: string,
    ethAddress: EthAddress
  ): Promise<boolean> {
    try {
      const ethAddressLowercase = ethAddress.toLowerCase()
      const permissions: WearableItemPermissionsData = await this.getCollectionItems(subgraphUrl, collection, itemId)
      return (
        (permissions.collectionCreator && permissions.collectionCreator === ethAddressLowercase) ||
        (permissions.collectionManagers && permissions.collectionManagers.includes(ethAddressLowercase)) ||
        (permissions.itemManagers && permissions.itemManagers.includes(ethAddressLowercase))
      )
    } catch (error) {
      this.LOGGER.error(`Error checking wearable access (${collection}, ${itemId}, ${ethAddress}).`, error)
      return false
    }
  }

  private async getCollectionItems(
    subgraphUrl: string,
    collection: string,
    itemId: string
  ): Promise<WearableItemPermissionsData> {
    const query = `
         query getCollectionRoles($collection: String!, $itemId: Int!) {
            collections(where:{ id: $collection, isApproved: false, isCompleted: true }) {
              creator
              managers
              minters
            }
            items(where:{collection: $collection, blockchainId: $itemId}) {
              managers
              minters
            }
        }`

    try {
      const wearableCollectionsAndItems = await this.fetcher.queryGraph<WearableCollectionsAndItems>(
        subgraphUrl,
        query,
        { collection, itemId: parseInt(itemId, 10) }
      )
      return {
        collectionCreator: wearableCollectionsAndItems.collections[0]?.creator,
        collectionManagers: wearableCollectionsAndItems.collections[0]?.managers,
        itemManagers: wearableCollectionsAndItems.items[0]?.managers
      }
    } catch (error) {
      this.LOGGER.error(`Error fetching wearable: (${collection}-${itemId})`, error)
      throw error
    }
  }
}

type WearableItemPermissionsData = {
  collectionCreator: string
  collectionManagers: string[]
  itemManagers: string[]
}

type WearableCollectionsAndItems = {
  collections: WearableCollection[]
  items: WearableCollectionItem[]
}

type WearableCollection = {
  creator: string
  managers: string[]
  minters: string[]
}

type WearableCollectionItem = {
  managers: string[]
  minters: string[]
}
