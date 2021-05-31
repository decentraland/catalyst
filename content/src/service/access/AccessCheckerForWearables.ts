import { BlockchainCollectionV2Asset, parseUrn } from '@dcl/urn-resolver'
import { Fetcher, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'

export class AccessCheckerForWearables {
  private static readonly L1_NETWORKS = ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
  private static readonly L2_NETWORKS = ['matic', 'mumbai']

  constructor(
    private readonly fetcher: Fetcher,
    private readonly collectionsL1SubgraphUrl: string,
    private readonly collectionsL2SubgraphUrl: string,
    private readonly blocksL1SubgraphUrl: string,
    private readonly blocksL2SubgraphUrl: string,
    private readonly LOGGER: log4js.Logger
  ) {}

  public async checkAccess(pointers: Pointer[], timestamp: Timestamp, ethAddress: EthAddress): Promise<string[]> {
    const errors: string[] = []

    if (pointers.length != 1) {
      errors.push(`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`)
    } else {
      const pointer: Pointer = pointers[0].toLowerCase()
      const parsed = await this.parseUrnNoFail(pointer)
      if (parsed) {
        const { contractAddress: collection, id: itemId, network } = parsed
        let collectionsSubgraphUrl: string
        let blocksSubgraphUrl: string
        if (AccessCheckerForWearables.L1_NETWORKS.includes(network)) {
          collectionsSubgraphUrl = this.collectionsL1SubgraphUrl
          blocksSubgraphUrl = this.blocksL1SubgraphUrl
        } else if (AccessCheckerForWearables.L2_NETWORKS.includes(network)) {
          collectionsSubgraphUrl = this.collectionsL2SubgraphUrl
          blocksSubgraphUrl = this.blocksL2SubgraphUrl
        } else {
          errors.push(`Found an unknown network on the urn '${network}'`)
          return errors
        }

        // Check that the address has access
        const hasAccess = await this.checkCollectionAccess(
          blocksSubgraphUrl,
          collectionsSubgraphUrl,
          collection,
          itemId,
          timestamp,
          ethAddress
        )
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
    blocksSubgraphUrl: string,
    collectionsSubgraphUrl: string,
    collection: string,
    itemId: string,
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<boolean> {
    try {
      const blockNumber = await this.findBlockForTimestamp(blocksSubgraphUrl, timestamp)
      const ethAddressLowercase = ethAddress.toLowerCase()
      const permissions: WearableItemPermissionsData = await this.getCollectionItems(
        collectionsSubgraphUrl,
        collection,
        itemId,
        blockNumber
      )
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
    itemId: string,
    block: number
  ): Promise<WearableItemPermissionsData> {
    const query = `
         query getCollectionRoles($collection: String!, $itemId: Int!, $block: Int!) {
            collections(where:{ id: $collection, isApproved: false, isCompleted: true }, block: { number: $block }) {
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
        { collection, itemId: parseInt(itemId, 10), block }
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

  private async findBlockForTimestamp(blocksSubgraphUrl: string, timestamp: Timestamp) {
    const query = `
      query getBlockForTimestamp($timestamp: Int!) {
        blocks(where: { timestamp_lte: $timestamp }, first: 1, orderBy: timestamp, orderDirection: desc) {
          number
        }
      }
    `
    try {
      const result = await this.fetcher.queryGraph<{ blocks: { number: number }[] }>(blocksSubgraphUrl, query, {
        timestamp: Math.ceil(timestamp / 1000)
      })
      return result.blocks[0].number
    } catch (error) {
      this.LOGGER.error(`Error fetching the block number for timestamp: (${timestamp})`, error)
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
