import { BlockchainCollectionThirdParty, BlockchainCollectionV2Asset, parseUrn } from '@dcl/urn-resolver'
import { Fetcher, Hashing, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import ms from 'ms'
import { AccessParams } from './AccessChecker'

export class AccessCheckerForWearables {
  private static readonly L1_NETWORKS = ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
  private static readonly L2_NETWORKS = ['matic', 'mumbai']

  constructor(
    private readonly fetcher: Fetcher,
    private readonly collectionsL1SubgraphUrl: string,
    private readonly collectionsL2SubgraphUrl: string,
    private readonly blocksL1SubgraphUrl: string,
    private readonly blocksL2SubgraphUrl: string,
    private readonly thirdPartySubgraphUrl: string,
    private readonly LOGGER: log4js.Logger
  ) {}

  public async checkAccess({ pointers, ...accessParams }: WearablesAccessParams): Promise<string[]> {
    if (pointers.length !== 1) return [`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`]

    const pointer: Pointer = pointers[0].toLowerCase()
    const parsed = await this.parseUrnNoFail(pointer)
    if (!parsed)
      return [
        `Wearable pointers should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${pointer})`
      ]

    const { network, type } = parsed

    const isL1Network = AccessCheckerForWearables.L1_NETWORKS.includes(network)
    const isL2Network = AccessCheckerForWearables.L2_NETWORKS.includes(network)
    if (!(isL1Network || isL2Network)) return [`Found an unknown network on the urn '${network}'`]

    const isThirdparty = type === 'blockchain-collection-third-party'

    if (isThirdparty) {
      const existsItem = await this.checkItemExistence(
        pointer,
        this.thirdPartySubgraphUrl,
        this.blocksL2SubgraphUrl,
        accessParams
      )
      if (!existsItem) return [`The third-party item ${pointer} does not exist.`]
      // @todo check if the third-party item is owne by the user
    } else {
      const { contractAddress: collection, id: itemId } = parsed
      const collectionsSubgraphUrl = isL1Network ? this.collectionsL1SubgraphUrl : this.collectionsL2SubgraphUrl
      const blocksSubgraphUrl = isL1Network ? this.blocksL1SubgraphUrl : this.blocksL2SubgraphUrl
      // Check that the address has access
      const hasAccess = await this.checkCollectionAccess(
        blocksSubgraphUrl,
        collectionsSubgraphUrl,
        collection,
        itemId,
        accessParams
      )
      if (!hasAccess) return [`The provided Eth Address does not have access to the following wearable: (${pointer})`]
    }
    return []
  }

  private async parseUrnNoFail(
    urn: string
  ): Promise<BlockchainCollectionV2Asset | BlockchainCollectionThirdParty | null> {
    try {
      const parsed = await parseUrn(urn)
      if (parsed?.type === 'blockchain-collection-v2-asset') {
        return parsed as BlockchainCollectionV2Asset
      } else if (parsed?.type === 'blockchain-collection-third-party') {
        return parsed as BlockchainCollectionThirdParty
      }
    } catch {}
    return null
  }

  private async checkItemExistence(
    urn: string,
    collectionsSubgraphUrl: string,
    blocksSubgraphUrl: string,
    { timestamp, content, metadata }: Omit<WearablesAccessParams, 'pointers'>
  ): Promise<boolean> {
    try {
      const { blockNumberAtDeployment, blockNumberFiveMinBeforeDeployment } = await this.findBlocksForTimestamp(
        blocksSubgraphUrl,
        timestamp
      )

      const existsOnBlock = async (blockNumber: number | undefined) =>
        !!blockNumber && this.existsItem(collectionsSubgraphUrl, urn, blockNumber, content, metadata)

      return (await existsOnBlock(blockNumberAtDeployment)) || (await existsOnBlock(blockNumberFiveMinBeforeDeployment))
    } catch (error) {
      this.LOGGER.error(`Error checking item existence (${urn}).`, error)
      return false
    }
  }

  private async existsItem(
    subgraphUrl: string,
    urn: string,
    block: number,
    content?: Map<string, string>,
    metadata?: any
  ): Promise<boolean> {
    const query = `
    query ($urn: String!, $block: Int!) {
      items(where:{ urn: $urn}, block: { number: $block }) {
        id,
        contentHash
      }
    }
    `
    const hashes = await this.calculateHashes(content, metadata)
    const result = await this.fetcher.queryGraph<{ id: string; contentHash: string } | undefined>(subgraphUrl, query, {
      urn,
      block
    })

    return result?.id !== undefined && hashes.includes(result?.contentHash)
  }

  private async checkCollectionAccess(
    blocksSubgraphUrl: string,
    collectionsSubgraphUrl: string,
    collection: string,
    itemId: string,
    { timestamp, ...accessParams }: Omit<WearablesAccessParams, 'pointers'>
  ): Promise<boolean> {
    try {
      const { blockNumberAtDeployment, blockNumberFiveMinBeforeDeployment } = await this.findBlocksForTimestamp(
        blocksSubgraphUrl,
        timestamp
      )
      // It could happen that the subgraph hasn't synced yet, so someone who just lost access still managed to make a deployment. The problem would be that when other catalysts perform
      // the same check, the subgraph might have synced and the deployment is no longer valid. So, in order to prevent inconsistencies between catalysts, we will allow all deployments that
      // have access now, or had access 5 minutes ago.

      const hasPermissionOnBlock = async (blockNumber: number | undefined) =>
        !!blockNumber &&
        (await this.hasPermission(collectionsSubgraphUrl, collection, itemId, blockNumber, accessParams))
      return (
        (await hasPermissionOnBlock(blockNumberAtDeployment)) ||
        (await hasPermissionOnBlock(blockNumberFiveMinBeforeDeployment))
      )
    } catch (error) {
      this.LOGGER.error(`Error checking wearable access (${collection}, ${itemId}, ${accessParams.ethAddress}).`, error)
      return false
    }
  }

  private async calculateHashes(content?: Map<string, string>, metadata?: any) {
    // Compare both by key and hash
    const compare = (a: { key: string; hash: string }, b: { key: string; hash: string }) => {
      if (a.hash > b.hash) return 1
      else if (a.hash < b.hash) return -1
      else return a.key > b.key ? 1 : -1
    }
    const entries = Array.from(content?.entries() ?? [])
    const contentAsJson = entries.map(([key, hash]) => ({ key, hash })).sort(compare)
    const buffer = Buffer.from(JSON.stringify({ content: contentAsJson, metadata }))
    return Promise.all([Hashing.calculateBufferHash(buffer), Hashing.calculateIPFSHash(buffer)])
  }

  private async hasPermission(
    subgraphUrl: string,
    collection: string,
    itemId: string,
    block: number,
    { ethAddress, content, metadata }: Omit<WearablesAccessParams, 'pointers' | 'timestamp'>
  ): Promise<boolean> {
    try {
      const permissions: WearableItemPermissionsData = await this.getCollectionItems(
        subgraphUrl,
        collection,
        itemId,
        block
      )
      const ethAddressLowercase = ethAddress.toLowerCase()

      if (!!permissions.contentHash) {
        const deployedByCommittee = permissions.committee.includes(ethAddressLowercase)
        return deployedByCommittee && (await this.calculateHashes(content, metadata)).includes(permissions.contentHash)
      } else {
        const addressHasAccess =
          (permissions.collectionCreator && permissions.collectionCreator === ethAddressLowercase) ||
          (permissions.collectionManagers && permissions.collectionManagers.includes(ethAddressLowercase)) ||
          (permissions.itemManagers && permissions.itemManagers.includes(ethAddressLowercase))

        // Deployments to the content server are made after the collection is completed, so that the committee can then approve it.
        // That's why isCompleted must be true, but isApproved must be false. After the committee approves the wearable, there can't be any more changes
        const isCollectionValid = !permissions.isApproved && permissions.isCompleted

        return addressHasAccess && isCollectionValid
      }
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

            accounts(where:{ isCommitteeMember: true }, block: { number: $block }) {
              id
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
      contentHash: itemResult?.contentHash,
      committee: result.accounts.map(({ id }) => id)
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
      if (blockNumberAtDeployment === undefined && blockNumberFiveMinBeforeDeployment === undefined) {
        throw new Error(`Failed to find blocks for the specific timestamp`)
      }

      return {
        blockNumberAtDeployment: !!blockNumberAtDeployment ? parseInt(blockNumberAtDeployment) : undefined,
        blockNumberFiveMinBeforeDeployment: !!blockNumberFiveMinBeforeDeployment
          ? parseInt(blockNumberFiveMinBeforeDeployment)
          : undefined
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

type WearablesAccessParams = Omit<AccessParams, 'type'>

type WearableItemPermissionsData = {
  collectionCreator: string
  collectionManagers: string[]
  itemManagers: string[]
  isApproved: boolean
  isCompleted: boolean
  contentHash: string
  committee: EthAddress[]
}

type WearableCollections = {
  collections: WearableCollection[]
  accounts: { id: EthAddress }[]
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
