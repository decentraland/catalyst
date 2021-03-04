import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EthAddress } from 'dcl-crypto'
import { NFTOwnership } from './NFTOwnership'

export class EnsOwnership extends NFTOwnership {
  constructor(private readonly theGraphClient: TheGraphClient, maxSize: number, maxAge: number) {
    super(maxSize, maxAge)
  }

  protected async querySubgraph(nftsToCheck: [EthAddress, Name[]][]) {
    const result = await this.theGraphClient.checkForNamesOwnership(nftsToCheck)
    return result.map(({ names, owner }) => ({ ownedNfts: names, owner }))
  }
}

type Name = string
