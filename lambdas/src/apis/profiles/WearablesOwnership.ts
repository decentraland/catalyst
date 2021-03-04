import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EthAddress } from 'dcl-crypto'
import { NFTOwnership } from './NFTOwnership'

/**
 * This is a custom cache that stores wearables owned by a given user. It can be configured with a max size of elements
 */
export class WearablesOwnership extends NFTOwnership {
  constructor(private readonly theGraphClient: TheGraphClient, maxSize: number, maxAge: number) {
    super(maxSize, maxAge)
  }

  protected async querySubgraph(nftsToCheck: [EthAddress, string[]][]) {
    const result = await this.theGraphClient.checkForWearablesOwnership(nftsToCheck)
    return result.map(({ urns, owner }) => ({ ownedNFTs: urns, owner }))
  }
}
