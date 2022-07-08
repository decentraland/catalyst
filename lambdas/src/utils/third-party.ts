import { EthAddress } from '@dcl/crypto'
import { WearableId } from '@dcl/schemas'
import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { FindWearablesByOwner, getWearablesByOwner } from '../controllers/handlers/collections/wearables'
import { ThirdPartyAsset, ThirdPartyAssets } from '../controllers/handlers/collections/utils/types'
import { SmartContentClient } from './SmartContentClient'
import { TheGraphClient } from './TheGraphClient'
import { IFetchComponent } from '@well-known-components/http-server'
import * as nodeFetch from 'node-fetch'

export function createFetchComponent(): IFetchComponent {
  const fetch: IFetchComponent = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init)
    }
  }
  return fetch
}

export interface ThirdPartyFetcher {
  fetchAssets: (url: string, collectionId: string, owner: EthAddress) => Promise<ThirdPartyAsset[] | undefined>
}

export function buildRegistryOwnerUrl(url: string, registryId: string, owner: string): string {
  const baseUrl = new URL(url).href.replace(/\/$/, '')
  return `${baseUrl}/registry/${registryId}/address/${owner}/assets`
}

export const createThirdPartyFetcher = (fetcher: IFetchComponent): ThirdPartyFetcher => ({
  fetchAssets: async (url: string, registryId: string, owner: EthAddress): Promise<ThirdPartyAsset[]> => {
    let baseUrl: string | undefined = buildRegistryOwnerUrl(url, registryId, owner)
    const allAssets: ThirdPartyAsset[] = []

    try {
      do {
        const response = await fetcher.fetch(baseUrl)

        const assetsByOwner = (await response.json()) as ThirdPartyAssets
        if (!assetsByOwner) {
          console.error(`No assets found with owner: ${owner}, url: ${url} and registryId: ${registryId} at ${baseUrl}`)
          break
        }

        for (const asset of assetsByOwner?.assets ?? []) {
          allAssets.push(asset)
        }

        baseUrl = assetsByOwner.next
      } while (baseUrl)

      return allAssets
    } catch (e) {
      console.error(e)
      throw new Error(
        `Error fetching assets with owner: ${owner}, url: ${url} and registryId: ${registryId} (${baseUrl})`
      )
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
      return (
        assetsByOwner
          ?.filter((asset) => asset.urn.decentraland.startsWith(thirdPartyId.thirdPartyId))
          .map((asset) => asset.urn.decentraland) ?? []
      )
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

  // TODO: [TPW] Use urn parser here
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

  for (const [address, wearables] of nftsToCheck) {
    const collectionsForAddress: Set<WearableId> = new Set()
    for (const wearable of wearables) {
      try {
        const parsedUrn: DecentralandAssetIdentifier | null = await parseUrn(wearable)
        if (parsedUrn?.type === 'blockchain-collection-third-party') {
          // TODO: [TPW] Do this with urn-resolver
          const collectionId = parsedUrn.uri.toString().split(':').slice(0, -1).join(':')
          collectionsForAddress.add(collectionId)
        }
      } catch (error) {
        console.debug(`There was an error parsing the urn: ${wearable}`)
      }
    }
    const ownedWearables: Set<string> = new Set()
    for (const collectionId of collectionsForAddress.values()) {
      const resolver = await createThirdPartyResolver(
        theGraphClient,
        createThirdPartyFetcher(createFetchComponent()),
        collectionId
      )
      const wearablesByOwner = await getWearablesByOwner(address, true, smartContentClient, resolver)

      for (const w of wearablesByOwner) {
        ownedWearables.add(w.urn)
      }
    }
    const sanitizedWearables = wearables.filter((w) => ownedWearables.has(w))
    response.set(address, sanitizedWearables)
  }
  return response
}
