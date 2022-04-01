import { fetchJson } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { FindWearablesByOwner } from '../apis/collections/controllers/wearables'
import { ThirdPartyAsset, ThirdPartyAssets } from '../apis/collections/types'
import { TheGraphClient } from './TheGraphClient'

const LOGGER = log4js.getLogger('ThirdPartyResolver')

export interface ThirdPartyFetcher {
  fetchAssets: (url: string, collectionId: string, owner: EthAddress) => Promise<ThirdPartyAsset[] | undefined>
}

export const createThirdPartyFetcher = (): ThirdPartyFetcher => ({
  fetchAssets: async (url: string, thirdPartyId: string, owner: EthAddress): Promise<ThirdPartyAsset[]> => {
    const parts = thirdPartyId.split(':')
    if (parts.length === 0) {
      throw new Error(
        `Invalid collectionId: ${thirdPartyId}. It must something like: urn:decentraland:{protocol}:collections-thirdparty:{third-party-name}`
      )
    }

    // We get the last part of the URN:
    // => urn:decentraland:{protocol}:collections-thirdparty:{third-party-name} => {third-party-name}
    const registryId = parts[parts.length - 1]
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
  thirdPartyId: string
): Promise<FindWearablesByOwner> => {
  const thirdPartyResolverAPI = await theGraphClient.findThirdPartyResolver('thirdPartyRegistrySubgraph', thirdPartyId)
  if (!thirdPartyResolverAPI) throw new Error(`Could not find third party resolver for collectionId: ${thirdPartyId}`)

  return {
    findWearablesByOwner: async (owner) => {
      const assetsByOwner = await thirdPartyFetcher.fetchAssets(thirdPartyResolverAPI, thirdPartyId, owner)
      if (!assetsByOwner) throw new Error(`Could not fetch assets for owner: ${owner}`)
      return assetsByOwner?.map((asset) => asset.urn.decentraland) ?? []
    }
  }
}
