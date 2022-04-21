import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { fetchJson } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { FindWearablesByOwner, getWearablesByOwner } from '../apis/collections/controllers/wearables'
import { ThirdPartyAsset, ThirdPartyAssets } from '../apis/collections/types'
import { SmartContentClient } from './SmartContentClient'
import { TheGraphClient } from './TheGraphClient'

const LOGGER = log4js.getLogger('ThirdPartyResolver')

export interface ThirdPartyFetcher {
  fetchAssets: (url: string, collectionId: string, owner: EthAddress) => Promise<ThirdPartyAsset[] | undefined>
}

export const createThirdPartyFetcher = (): ThirdPartyFetcher => ({
  fetchAssets: async (url: string, registryId: string, owner: EthAddress): Promise<ThirdPartyAsset[]> => {
    try {
      const assetsByOnwer = (await fetchJson(`${url}/registry/${registryId}/address/${owner}/assets`, {
        timeout: '5000'
      })) as ThirdPartyAssets

      if (!assetsByOnwer)
        LOGGER.debug(`No assets found with owner: ${owner}, url: ${url} and registryId: ${registryId}`)
      return assetsByOnwer?.assets ?? []
    } catch (e) {
      throw new Error(`Error fetching assets with owner: ${owner}, url: ${url} and registryId: ${registryId}`)
    }
  }
})

export const createThirdPartyResolver = async (
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyFetcher,
  collectionId: string
): Promise<FindWearablesByOwner> => {
  const thirdPartyId = parseCollectionId(collectionId)
  const thirdPartyResolverAPI = await theGraphClient.findThirdPartyResolver(
    'thirdPartyRegistrySubgraph',
    thirdPartyId.thirdPartyId
  )
  if (!thirdPartyResolverAPI) throw new Error(`Could not find third party resolver for collectionId: ${collectionId}`)

  return {
    findWearablesByOwner: async (owner) => {
      const assetsByOwner = await thirdPartyFetcher.fetchAssets(thirdPartyResolverAPI, thirdPartyId.registryId, owner)
      if (!assetsByOwner) throw new Error(`Could not fetch assets for owner: ${owner}`)
      return assetsByOwner?.map((asset) => asset.urn.decentraland) ?? []
    }
  }
}

// urn:decentraland:{protocol}:collections-thirdparty:{third-party-name}
// urn:decentraland:{protocol}:collections-thirdparty:{third-party-name}:{collection-id}
type ThirdPartyId = {
  urn: string
  thirdPartyId: string
  registryId: string
}

const parseCollectionId = (collectionId: string): ThirdPartyId => {
  const parts = collectionId.split(':')

  // TODO: Use urn parser here
  if (!(parts.length === 5 || parts.length === 6)) {
    throw new Error(`Couldn't parse collectionId ${collectionId}, valid ones are like:
    \n - urn:decentraland:{protocol}:collections-thirdparty:{third-party-name}
    \n - urn:decentraland:{protocol}:collections-thirdparty:{third-party-name}:{collection-id}`)
  }

  return {
    urn: collectionId,
    thirdPartyId: parts.slice(0, 5).join(':'),
    registryId: parts[4]
  }
}

export async function checkForThirdPartyWearablesOwnership(
  theGraphClient: TheGraphClient,
  smartContentClient: SmartContentClient,
  nftsToCheck: [EthAddress, string[]][]
): Promise<{ owner: EthAddress; urns: string[] }[]> {
  const response: { owner: EthAddress; urns: string[] }[] = []
  nftsToCheck.map((entry) => {
    const address: EthAddress = entry[0]
    const wearables: string[] = entry[1]
    const collectionsForAddress: Set<string> = new Set()
    wearables.forEach(async (wearable) => {
      console.log(`[TPW-DEBUG] About to check ownership of '${wearable}'`)
      const parsedUrn: DecentralandAssetIdentifier | null = await parseUrn(wearable)
      if (parsedUrn?.type === 'blockchain-collection-third-party') {
        // TODO: Do this with urn-resolver
        const collectionId = parsedUrn.uri.toString().split(':').slice(0, -1).join(':')
        console.log(`[TPW-DEBUG] Added '${collectionId}' to third-party collection`)
        collectionsForAddress.add(collectionId)
      }
    })
    collectionsForAddress.forEach(async (collectionId) => {
      const wearablesByOwner = await getWearablesByOwner(
        address,
        true,
        smartContentClient,
        await createThirdPartyResolver(theGraphClient, createThirdPartyFetcher(), collectionId)
      )
      // const onlyAskedWearables = wearablesByOwner.map((a) => a.urn).filter((a) => !!wearables.find((b) => b === a))
      response.push({ owner: address, urns: wearablesByOwner.map((a) => a.urn) })
    })
  })
  return response
}
