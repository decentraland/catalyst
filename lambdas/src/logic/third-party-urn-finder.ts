import { EthAddress } from '@dcl/crypto'
import { ThirdPartyAssetFetcher } from '../ports/third-party/third-party-fetcher'
import { TheGraphClient } from '../utils/TheGraphClient'

export async function findThirdPartyItemUrns(
  theGraphClient: TheGraphClient,
  thirdPartyAssetFetcher: ThirdPartyAssetFetcher,
  owner: EthAddress,
  collectionId: string
) {
  const thirdPartyId = parseCollectionId(collectionId)
  const thirdPartyResolverAPI = await theGraphClient.findThirdPartyResolver(
    'thirdPartyRegistrySubgraph',
    thirdPartyId.thirdPartyId
  )
  if (!thirdPartyResolverAPI) throw new Error(`Could not find third party resolver for collectionId: ${collectionId}`)
  const assetsByOwner = await thirdPartyAssetFetcher.fetchAssets(thirdPartyResolverAPI, thirdPartyId.registryId, owner)
  return (
    assetsByOwner
      ?.filter((asset) => asset.urn.decentraland.startsWith(thirdPartyId.thirdPartyId))
      .map((asset) => asset.urn.decentraland) ?? []
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
