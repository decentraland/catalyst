import { EthAddress } from '@dcl/crypto'
import { IFetchComponent } from '@well-known-components/http-server'
import { FindWearablesByOwner } from '../apis/collections/controllers/wearables'
import { ThirdPartyAPIResponse, ThirdPartyAsset } from '../apis/collections/types'
import { createFetchComponent } from '../ports/createFetchComponent'
import { TheGraphClient } from './TheGraphClient'

export interface ThirdPartyFetcher {
  fetchAssets: (url: string, collectionId: string, owner: EthAddress) => Promise<ThirdPartyAsset[] | undefined>
}

export function buildRegistryOwnerUrl(baseUrl: string, registryId: string, owner: string): string {
  const cleanedBaseUrl = new URL(baseUrl).href.replace(/\/$/, '')
  return `${cleanedBaseUrl}/registry/${registryId}/address/${owner}/assets`
}

export function createThirdPartyFetcher(fetcher: IFetchComponent): ThirdPartyFetcher {
  return {
    fetchAssets: async (url: string, registryId: string, owner: EthAddress): Promise<ThirdPartyAsset[]> => {
      let registryUrl: string | undefined = buildRegistryOwnerUrl(url, registryId, owner)
      const allAssets: ThirdPartyAsset[] = []

      try {
        do {
          const response = await fetcher.fetch(registryUrl)

          const assetsByOwner = (await response.json()) as ThirdPartyAPIResponse
          if (!assetsByOwner) {
            console.error(`No assets found with owner: ${owner}, url: ${url} and registryId: ${registryId} at ${registryUrl}`)
            break
          }

          for (const asset of assetsByOwner?.assets ?? []) {
            allAssets.push(asset)
          }

          registryUrl = assetsByOwner.next
        } while (registryUrl)

        return allAssets
      } catch (e) {
        console.error(e)
        throw new Error(
          `Error fetching assets with owner: ${owner}, url: ${url} and registryId: ${registryId} (${registryUrl})`
        )
      }
    }
  }
}

export async function createThirdPartyResolver(
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyFetcher,
  collectionId: string
): Promise<FindWearablesByOwner> {
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

export async function createThirdPartyResolverAux(
  theGraphClient: TheGraphClient,
  collectionId: string
): Promise<FindWearablesByOwner> {
  return createThirdPartyResolver(
    theGraphClient, createThirdPartyFetcher(createFetchComponent()), collectionId
  )
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
