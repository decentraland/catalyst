import { WearableId } from '@dcl/schemas'
import { fetchJson } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { FindWearablesByOwner } from '../apis/collections/controllers/wearables'
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
  nftsToCheck: Map<EthAddress, WearableId[]>
): Promise<Map<EthAddress, WearableId[]>> {
  const response: Map<EthAddress, WearableId[]> = new Map()

  // nftsToCheck.forEach((wearables: WearableId[], address: EthAddress) => {
  //   const collectionsForAddress: Set<string> = new Set()
  //   wearables.forEach(async (wearable) => {
  //     console.log(`[TPW-DEBUG] About to check ownership of '${wearable}'`)
  //     const parsedUrn: DecentralandAssetIdentifier | null = await parseUrn(wearable)
  //     if (parsedUrn?.type === 'blockchain-collection-third-party') {
  //       console.log(`[TPW-DEBUG] ${wearable} is third-party`)
  //       // TODO: Do this with urn-resolver
  //       const collectionId = parsedUrn.uri.toString().split(':').slice(0, -1).join(':')
  //       console.log(`[TPW-DEBUG] Added '${collectionId}' to third-party collection`)
  //       collectionsForAddress.add(collectionId)
  //     }
  //   })
  //   const ownedWearables: Set<string> = new Set()
  //   collectionsForAddress.forEach(async (collectionId) => {
  //     const wearablesByOwner = await getWearablesByOwner(
  //       address,
  //       true,
  //       smartContentClient,
  //       await createThirdPartyResolver(theGraphClient, createThirdPartyFetcher(), collectionId)
  //     )
  //     console.log(
  //       `[TPW-DEBUG] Owned wearables are: ${wearablesByOwner.length} '${wearablesByOwner.map((a) => a.urn).join(',')}'`
  //     )
  //     wearablesByOwner.forEach((w) => ownedWearables.add(w.urn))
  //   })

  //   const sanitizedWearables = wearables.filter((w) => ownedWearables.has(w))

  //   console.log(
  //     `[TPW-DEBUG] Owned wearables for address ${address} are: ${sanitizedWearables.length} '${sanitizedWearables.join(
  //       ','
  //     )}'`
  //   )
  //   response.set(address, sanitizedWearables)
  // })
  return response
}
