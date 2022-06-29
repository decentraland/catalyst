import { EthAddress } from '@dcl/crypto'
import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { createThirdPartyResolverAux } from '../../utils/third-party'
import { getWearablesByOwner } from '../collections/controllers/wearables'
import { WearableId } from '../collections/types'

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
      const resolver = await createThirdPartyResolverAux(
        theGraphClient,
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
