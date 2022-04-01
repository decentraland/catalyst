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
  fetchAssets: async (url: string, collectionId: string, owner: EthAddress): Promise<ThirdPartyAsset[]> => {
    try {
      const assetsByOnwer = (await fetchJson(`${url}/registry/${collectionId}/address/${owner}/assets`, {
        timeout: '5000'
      })) as ThirdPartyAssets

      if (!assetsByOnwer)
        LOGGER.debug(`No assets found with owner: ${owner}, url: ${url} and registryId: ${collectionId}`)
      return assetsByOnwer?.assets ?? []
    } catch (e) {
      throw new Error(`Error fetching assets with owner: ${owner}, url: ${url} and registryId: ${collectionId}`)
    }
  }
})

export const createThirdPartyResolver = async (
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyFetcher,
  collectionId: string
): Promise<FindWearablesByOwner> => {
  const thirdPartyResolverAPI = await theGraphClient.findThirdPartyResolver('thirdPartyRegistrySubgraph', collectionId)
  if (!thirdPartyResolverAPI) throw new Error(`Could not find third party resolver for collectionId: ${collectionId}`)

  return {
    findWearablesByOwner: async (owner) => {
      const assetsByOwner = await thirdPartyFetcher.fetchAssets(thirdPartyResolverAPI, collectionId, owner)
      if (!assetsByOwner) throw new Error(`Could not fetch assets for owner: ${owner}`)
      return assetsByOwner?.map((asset) => asset.urn.decentraland) ?? []
    }
  }
}
