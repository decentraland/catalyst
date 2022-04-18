import { EthAddress } from 'dcl-crypto'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { checkForThirdPartyWearablesOwnership } from '../../utils/third-party'
import { NFTOwnership } from './NFTOwnership'

/**
 * This is a custom cache that stores wearables owned by a given user. It can be configured with a max size of elements
 */
export class WearablesOwnership extends NFTOwnership {
  constructor(
    private readonly theGraphClient: TheGraphClient,
    private readonly smartContentClient: SmartContentClient,
    maxSize: number,
    maxAge: number
  ) {
    super(maxSize, maxAge)
  }

  protected async checkOwnership(
    nftsToCheck: [EthAddress, string[]][]
  ): Promise<{ ownedNFTs: string[]; owner: string }[]> {
    const onChainWearables = await this.theGraphClient.checkForWearablesOwnership(nftsToCheck)
    const thirdPartyWearables = await checkForThirdPartyWearablesOwnership(
      this.theGraphClient,
      this.smartContentClient,
      nftsToCheck
    )
    const allWearables = onChainWearables.concat(thirdPartyWearables)
    return allWearables.map(({ urns, owner }) => ({ ownedNFTs: urns, owner }))
  }
}
