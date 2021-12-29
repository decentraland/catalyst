import { EthAddress } from '@dcl/schemas'
import { BlockchainCollectionV1Asset, BlockchainCollectionV2Asset, OffChainAsset, parseUrn } from '@dcl/urn-resolver'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { Fetcher, Hashing, Timestamp } from 'dcl-catalyst-commons'
import ms from 'ms'
import { ContentAuthenticator } from '../auth/Authenticator'
import { AccessParams } from './AccessChecker'

type SupportedAssets = BlockchainCollectionV1Asset | BlockchainCollectionV2Asset | OffChainAsset

export class AccessCheckerForWearables {
  private static readonly L1_NETWORKS = ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli']
  private static readonly L2_NETWORKS = ['matic', 'mumbai']

  constructor(
    private readonly fetcher: Fetcher,
    private readonly collectionsL1SubgraphUrl: string,
    private readonly collectionsL2SubgraphUrl: string,
    private readonly blocksL1SubgraphUrl: string,
    private readonly blocksL2SubgraphUrl: string,
    private readonly LOGGER: ILoggerComponent.ILogger,
    private readonly authenticator: ContentAuthenticator
  ) {}

  public async checkAccess({ pointers, ...accessParams }: WearablesAccessParams): Promise<string[]> {
    const resolvedPointers: SupportedAssets[] = []

    // deduplicate pointer resolution
    for (const pointer of pointers) {
      const parsed = await this.parseUrnNoFail(pointer)
      if (parsed) {
        if (!this.alreadySeen(resolvedPointers, parsed)) {
          resolvedPointers.push(parsed)
        }
      } else {
        return [
          `Wearable pointers should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${pointer})`
        ]
      }
    }

    if (resolvedPointers.length > 1) {
      return [`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`]
    }

    const parsed = resolvedPointers[0]

    if (parsed.type === 'off-chain') {
      // Validate Off Chain Asset
      if (!this.authenticator.isAddressOwnedByDecentraland(accessParams.ethAddress)) {
        return [
          `The provided Eth Address '${accessParams.ethAddress}' does not have access to the following wearable: '${parsed.uri}'`
        ]
      }
    } else if (parsed?.type === 'blockchain-collection-v1-asset' || parsed?.type === 'blockchain-collection-v2-asset') {
      // L1 or L2 so contractAddress is present
      const collection = parsed.contractAddress!
      const network = parsed.network
      if (AccessCheckerForWearables.L1_NETWORKS.includes(network)) {
        const hasAccess = await this.checkCollectionAccess(
          this.blocksL1SubgraphUrl,
          this.collectionsL1SubgraphUrl,
          collection,
          parsed.id,
          accessParams
        )
        if (!hasAccess) {
          // Some L1 collections are deployed by Decentraland Address
          const isDecentralandAddress = this.authenticator.isAddressOwnedByDecentraland(accessParams.ethAddress)
          // Maybe this is not necessary as we already know that it's a 'blockchain-collection-v1-asset'
          const isAllowlistedCollection = parsed.uri.toString().startsWith('urn:decentraland:ethereum:collections-v1')
          if (!isDecentralandAddress || !isAllowlistedCollection) {
            return [
              `The provided Eth Address '${accessParams.ethAddress}' does not have access to the following wearable: '${parsed.uri}'`
            ]
          }
        }
      } else if (AccessCheckerForWearables.L2_NETWORKS.includes(network)) {
        const hasAccess = await this.checkCollectionAccess(
          this.blocksL2SubgraphUrl,
          this.collectionsL2SubgraphUrl,
          collection,
          parsed.id,
          accessParams
        )
        if (!hasAccess) {
          return [
            `The provided Eth Address does not have access to the following wearable: (${parsed.contractAddress}, ${parsed.id})`
          ]
        }
      } else {
        return [`Found an unknown network on the urn '${network}'`]
      }
    } else {
      return [`Could not resolve the contractAddress of the urn ${parsed}`]
    }
    return []
  }

  private alreadySeen(resolvedPointers: SupportedAssets[], parsed: SupportedAssets) {
    return resolvedPointers.some((alreadyResolved) => this.resolveSameUrn(alreadyResolved, parsed))
  }

  private resolveSameUrn(alreadyParsed: SupportedAssets, parsed: SupportedAssets): boolean {
    const alreadyParsedCopy = Object.assign({}, alreadyParsed)
    const parsedCopy = Object.assign({}, parsed)
    alreadyParsedCopy.uri = new URL('urn:same')
    parsedCopy.uri = new URL('urn:same')
    return JSON.stringify(alreadyParsedCopy) == JSON.stringify(parsedCopy)
  }

  private async parseUrnNoFail(urn: string): Promise<SupportedAssets | null> {
    try {
      const parsed = await parseUrn(urn)
      if (parsed?.type === 'blockchain-collection-v1-asset') {
        return parsed
      }
      if (parsed?.type === 'blockchain-collection-v2-asset') {
        return parsed
      }
      if (parsed?.type === 'off-chain') {
        return parsed
      }
    } catch {}
    return null
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
      this.LOGGER.error(
        `Error checking wearable access (${collection}, ${itemId}, ${accessParams.ethAddress}, ${timestamp}, ${blocksSubgraphUrl}).`,
        error
      )
      return false
    }
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
        const calculateHashes = () => {
          // Compare both by key and hash
          const compare = (a: { key: string; hash: string }, b: { key: string; hash: string }) => {
            if (a.hash > b.hash) return 1
            else if (a.hash < b.hash) return -1
            else return a.key > b.key ? 1 : -1
          }

          const contentAsJson = content?.map(({ file, hash }) => ({ key: file, hash })).sort(compare)
          const buffer = Buffer.from(JSON.stringify({ content: contentAsJson, metadata }))
          return Promise.all([Hashing.calculateBufferHash(buffer), Hashing.calculateIPFSHash(buffer)])
        }
        return deployedByCommittee && (await calculateHashes()).includes(permissions.contentHash)
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
         query getCollectionRoles($collection: String!, $itemId: String!, $block: Int!) {
            collections(where:{ id: $collection }, block: { number: $block }) {
              creator
              managers
              isApproved
              isCompleted
              items(where:{ id: $itemId }) {
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
      itemId: `${collection}-${itemId}`,
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
      committee: result.accounts.map(({ id }) => id.toLowerCase())
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
      this.LOGGER.error(`Error fetching the block number for timestamp`, { timestamp, error: error.message })
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
