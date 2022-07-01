import { EthAddress } from '@dcl/crypto'
import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { findThirdPartyItemUrns } from '../../logic/third-party-urn-finder'
import { ThirdPartyAssetFetcher } from '../../ports/third-party/third-party-fetcher'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { WearableId } from '../collections/types'

export async function checkForThirdPartyWearablesOwnership(
  theGraphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
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
      const wearableIdsByOwner = await findThirdPartyItemUrns(theGraphClient, thirdPartyFetcher, address, collectionId)

      for (const id of wearableIdsByOwner) {
        ownedWearables.add(id)
      }
    }
    const sanitizedWearables = wearables.filter((w) => ownedWearables.has(w))
    response.set(address, sanitizedWearables)
  }
  return response
}
