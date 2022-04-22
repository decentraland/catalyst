import { EthAddress } from 'dcl-crypto'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { NFTOwnership } from './NFTOwnership'

/**
 * This is a custom cache that stores wearables owned by a given user. It can be configured with a max size of elements
 */
export class WearablesOwnership extends NFTOwnership {
  constructor(private readonly theGraphClient: TheGraphClient, maxSize: number, maxAge: number) {
    super(maxSize, maxAge)
  }

  protected async checkOwnership(
    nftsToCheck: [EthAddress, string[]][]
  ): Promise<{ ownedNFTs: string[]; owner: string }[]> {
    const onChainWearables = await this.theGraphClient.checkForWearablesOwnership(nftsToCheck)
    return onChainWearables.map(({ urns, owner }) => ({ ownedNFTs: urns, owner }))
  }
}
