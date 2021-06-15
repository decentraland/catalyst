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
      const { blockNumberNow, blockNumberFiveMinBefore } = await this.findBlocksForTimestamp(
        blocksSubgraphUrl,
        timestamp
      )
      // It could happen that the subgraph hasn't synced yet, so someone who just lost access still managed to make a deployment. The problem would be that when other catalysts perform
      // the same check, the subgraph managed to sync and the deployment is now invalid. So, in order to prevent inconsistencies between catalysts, we will allow all deployments that
      // have access now, or had access 5 minutes ago.
      return (
        (await this.hasPermission(ethAddress, collectionsSubgraphUrl, collection, itemId, blockNumberNow)) ||
        (await this.hasPermission(ethAddress, collectionsSubgraphUrl, collection, itemId, blockNumberFiveMinBefore))
      )
    } catch (error) {
      this.LOGGER.error(`Error checking wearable access (${collection}, ${itemId}, ${ethAddress}).`, error)
      return false
    }
  }

  private async hasPermission(
    ethAddress: string,
    subgraphUrl: string,
    collection: string,
    itemId: string,
    block: number
  ): Promise<boolean> {
    const permissions: WearableItemPermissionsData = await this.getCollectionItems(
      subgraphUrl,
      collection,
      itemId,
      block
    )
    const ethAddressLowercase = ethAddress.toLowerCase()
    return (
      (permissions.collectionCreator && permissions.collectionCreator === ethAddressLowercase) ||
      (permissions.collectionManagers && permissions.collectionManagers.includes(ethAddressLowercase)) ||
      (permissions.itemManagers && permissions.itemManagers.includes(ethAddressLowercase))
    )
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

  private async findBlocksForTimestamp(blocksSubgraphUrl: string, timestamp: Timestamp) {
    const query = `
      query getBlockForTimestamp($timestamp: Int!, $timestamp5Min: Int!) {
        before: blocks(where: { timestamp_lte: $timestamp }, first: 1, orderBy: timestamp, orderDirection: desc) {
          number
        }
        after: blocks(where: { timestamp_gte: $timestamp }, first: 1, orderBy: timestamp, orderDirection: asc) {
          number
        }
        fiveMin: blocks(where: { timestamp_lte: $timestamp5Min }, first: 1, orderBy: timestamp, orderDirection: desc) {
          number
        }
      }
    `
    try {
      const timestampSec = Math.ceil(timestamp / 1000)
      const result = await this.fetcher.queryGraph<{
        before: { number: number }[]
        after: { number: number }[]
        fiveMin: { number: number }[]
      }>(blocksSubgraphUrl, query, {
        timestamp: timestampSec,
        timestamp5Min: timestampSec - 60 * 5
      })
      // To get the deployment's block number, we check the one immediately after the entity's timestamp. Since it could not exist, we default to the one immediately before.
      const blockNumberNow = result.after?.[0]?.number ?? result.before[0].number
      const blockNumberFiveMinBefore = result.fiveMin[0].number
      return { blockNumberNow, blockNumberFiveMinBefore }
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
