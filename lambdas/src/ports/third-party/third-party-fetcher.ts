import { EthAddress } from '@dcl/crypto'
import { IFetchComponent } from '@well-known-components/http-server'
import { ThirdPartyAPIResponse, ThirdPartyAsset } from '../../apis/collections/types'

export interface ThirdPartyAssetFetcher {
  fetchAssets: (url: string, collectionId: string, owner: EthAddress) => Promise<ThirdPartyAsset[] | undefined>
}

export function createThirdPartyAssetFetcher(fetcher: IFetchComponent) {
  return {
    async fetchAssets(url: string, registryId: string, owner: EthAddress): Promise<ThirdPartyAsset[]> {
      let registryUrl: string | undefined = buildRegistryOwnerUrl(url, registryId, owner)
      const allAssets: ThirdPartyAsset[] = []

      try {
        do {
          const response = await fetcher.fetch(registryUrl)

          const assetsByOwner = (await response.json()) as ThirdPartyAPIResponse
          if (!assetsByOwner) {
            console.error(
              `No assets found with owner: ${owner}, url: ${url} and registryId: ${registryId} at ${registryUrl}`
            )
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

export function buildRegistryOwnerUrl(baseUrl: string, registryId: string, owner: string): string {
  const sanitizedBaseUrl = new URL(baseUrl).href.replace(/\/$/, '')
  return `${sanitizedBaseUrl}/registry/${registryId}/address/${owner}/assets`
}
