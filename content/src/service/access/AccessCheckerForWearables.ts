import { parseUrn } from '@dcl/urn-resolver'
import { Fetcher, Pointer } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'

export class AccessCheckerForWearables {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly dclCollectionsAccessUrl: string,
    private readonly LOGGER: log4js.Logger
  ) {}

  public async checkAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
    const errors: string[] = []

    if (pointers.length != 1) {
      errors.push(`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`)
    }

    const pointer: Pointer = pointers[0].toLowerCase()
    const parsed = await parseUrn<{ contractAddress: string; id: string; url: URL }>(pointer)
    if (parsed) {
      const { contractAddress: collection, id: itemId } = parsed

      // Check that the address has access
      const hasAccess = await this.checkCollectionAccess(collection, itemId, ethAddress)
      if (!hasAccess) {
        errors.push(`The provided Eth Address does not have access to the following wearable: (${pointer})`)
      }
    } else {
      errors.push(
        `Wearable pointers should be a urn, for example (decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${pointer})`
      )
    }
    return errors
  }

  private async checkCollectionAccess(collection: string, itemId: string, ethAddress: EthAddress): Promise<boolean> {
    try {
      const ethAddressLowercase = ethAddress.toLowerCase()
      const permissions: WearableItemPermissionsData = await this.getCollectionItems(collection, itemId)
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

  private async getCollectionItems(collection: string, itemId: string): Promise<WearableItemPermissionsData> {
    const query = `
         query getCollectionRoles($collection: String!, $itemId: Int!) {
            collections(where:{id: $collection}) {
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
        this.dclCollectionsAccessUrl,
        query,
        { collection: collection, itemId: itemId }
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
