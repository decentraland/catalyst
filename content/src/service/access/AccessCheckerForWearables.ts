import { BlockchainCollectionV2Asset, parseUrn } from '@dcl/urn-resolver'
import { EntityId, Fetcher, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import ms from 'ms'

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

  public async checkAccess({
    entityId,
    pointers,
    timestamp,
    ethAddress
  }: {
    entityId: EntityId
    pointers: Pointer[]
    timestamp: Timestamp
    ethAddress: EthAddress
  }): Promise<string[]> {
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
          entityId,
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
    entityId: EntityId,
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<boolean> {
    try {
      const { blockNumberAtDeployment, blockNumberFiveMinBeforeDeployment } = await this.findBlocksForTimestamp(
        blocksSubgraphUrl,
        timestamp
      )
      // It could happen that the subgraph hasn't synced yet, so someone who just lost access still managed to make a deployment. The problem would be that when other catalysts perform
      // the same check, the subgraph might have synced and the deployment is no longer valid. So, in order to prevent inconsistencies between catalysts, we will allow all deployments that
      // have access now, or had access 5 minutes ago.
      return (
        (await this.hasPermission(
          ethAddress,
          collectionsSubgraphUrl,
          collection,
          itemId,
          entityId,
          blockNumberAtDeployment
        )) ||
        (await this.hasPermission(
          ethAddress,
          collectionsSubgraphUrl,
          collection,
          itemId,
          entityId,
          blockNumberFiveMinBeforeDeployment
        ))
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
    entityId: EntityId,
    block: number
  ): Promise<boolean> {
    try {
      const permissions: WearableItemPermissionsData = await this.getCollectionItems(
        subgraphUrl,
        collection,
        itemId,
        block
      )

      const ethAddressLowercase = ethAddress.toLowerCase()
      const addressHasAccess =
        (permissions.collectionCreator && permissions.collectionCreator === ethAddressLowercase) ||
        (permissions.collectionManagers && permissions.collectionManagers.includes(ethAddressLowercase)) ||
        (permissions.itemManagers && permissions.itemManagers.includes(ethAddressLowercase))

      // Deployments to the content server are made after the collection is completed, so that the committee can then approve it.
      // That's why isCompleted must be true, but isApproved must be false. After the committee approves the wearable, there can't be any more changes
      const isCollectionValid = !permissions.isApproved && permissions.isCompleted

      return (!permissions.contentHash && addressHasAccess && isCollectionValid) || permissions.contentHash === entityId
    } catch (error) {
      this.LOGGER.error(`Error checking permission for (${collection}-${itemId}) at block ${block}`, error)
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
            collections(where:{ id: $collection }, block: { number: $block }) {
              creator
              managers
              isApproved
              isCompleted
              items(where:{ blockchainId: $itemId }) {
                managers
                contentHash
              }
            }
        }`

    const result = await this.fetcher.queryGraph<WearableCollections>(subgraphUrl, query, {
      collection,
      itemId: parseInt(itemId, 10),
      block
    })
    const collectionResult = result.collections[0]
    const itemResult = collectionResult?.items[0]
    return {
      collectionCreator: collectionResult?.creator,
      collectionManagers: collectionResult?.managers,
      isApproved: collectionResult?.isApproved,
      isCompleted: collectionResult?.isCompleted,
      itemManagers: itemResult?.managers,
      contentHash: itemResult?.contentHash
    }
  }

  // When we want to find a block for a specific timestamp, we define an access window. This means that
  // we will place will try to find the closes block to the timestamp, but only if it's within the window
  private static readonly ACCESS_WINDOW_IN_SECONDS = ms('15s') / 1000

  private async findBlocksForTimestamp(blocksSubgraphUrl: string, timestamp: Timestamp) {
    const query = `
    query getBlockForTimestamp($timestamp: Int!, $timestampMin: Int!, $timestampMax: Int!, $timestamp5Min: Int!, $timestamp5MinMax: Int!, $timestamp5MinMin: Int!) {
      before: blocks(where: { timestamp_lte: $timestamp, timestamp_gte: $timestampMin  }, first: 1, orderBy: timestamp, orderDirection: desc) {
        number
      }
      after: blocks(where: { timestamp_gte: $timestamp, timestamp_lte: $timestampMax }, first: 1, orderBy: timestamp, orderDirection: asc) {
        number
      }
      fiveMinBefore: blocks(where: { timestamp_lte: $timestamp5Min, timestamp_gte: $timestamp5MinMin, }, first: 1, orderBy: timestamp, orderDirection: desc) {
        number
      }
      fiveMinAfter: blocks(where: { timestamp_gte: $timestamp5Min, timestamp_lte: $timestamp5MinMax }, first: 1, orderBy: timestamp, orderDirection: asc) {
        number
      }
    }
    `
    try {
      const timestampSec = Math.ceil(timestamp / 1000)
      const timestamp5MinAgo = timestampSec - 60 * 5
      const window = this.getWindowFromTimestamp(timestampSec)
      const window5MinAgo = this.getWindowFromTimestamp(timestamp5MinAgo)
      const result = await this.fetcher.queryGraph<{
        before: { number: string }[]
        after: { number: string }[]
        fiveMinBefore: { number: string }[]
        fiveMinAfter: { number: string }[]
      }>(blocksSubgraphUrl, query, {
        timestamp: timestampSec,
        timestampMax: window.max,
        timestampMin: window.min,
        timestamp5Min: timestamp5MinAgo,
        timestamp5MinMax: window5MinAgo.max,
        timestamp5MinMin: window5MinAgo.min
      })

      // To get the deployment's block number, we check the one immediately after the entity's timestamp. Since it could not exist, we default to the one immediately before.
      const blockNumberAtDeployment = result.after[0]?.number ?? result.before[0]?.number
      const blockNumberFiveMinBeforeDeployment = result.fiveMinAfter[0]?.number ?? result.fiveMinBefore[0]?.number
      if (blockNumberAtDeployment === undefined || blockNumberFiveMinBeforeDeployment === undefined) {
        throw new Error(`Failed to find blocks for the specific timestamp`)
      }

      return {
        blockNumberAtDeployment: parseInt(blockNumberAtDeployment),
        blockNumberFiveMinBeforeDeployment: parseInt(blockNumberFiveMinBeforeDeployment)
      }
    } catch (error) {
      this.LOGGER.error(`Error fetching the block number for timestamp: (${timestamp})`, error)
      throw error
    }
  }

  private getWindowFromTimestamp(timestamp: Timestamp) {
    const windowMin = timestamp - Math.floor(AccessCheckerForWearables.ACCESS_WINDOW_IN_SECONDS / 2)
    const windowMax = timestamp + Math.ceil(AccessCheckerForWearables.ACCESS_WINDOW_IN_SECONDS / 2)
    return {
      max: windowMax,
      min: windowMin
    }
  }
}

type WearableItemPermissionsData = {
  collectionCreator: string
  collectionManagers: string[]
  itemManagers: string[]
  isApproved: boolean
  isCompleted: boolean
  contentHash: string
}

type WearableCollections = {
  collections: WearableCollection[]
}

export type WearableCollection = {
  creator: string
  managers: string[]
  isApproved: boolean
  isCompleted: boolean
  items: WearableCollectionItem[]
}

type WearableCollectionItem = {
  managers: string[]
  contentHash: string
}
