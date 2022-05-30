import { EthAddress } from '@dcl/crypto';
import { TheGraphClient } from '../../utils/TheGraphClient';
import { NFTOwnership } from './NFTOwnership';

export class EnsOwnership extends NFTOwnership {
  constructor(private readonly theGraphClient: TheGraphClient, maxSize: number, maxAge: number) {
    super(maxSize, maxAge)
  }

  protected async querySubgraph(
    nftsToCheck: [EthAddress, Name[]][]
  ): Promise<{ ownedNFTs: string[]; owner: string }[]> {
    const result = await this.theGraphClient.checkForNamesOwnership(nftsToCheck)
    return result.map(({ names, owner }) => ({ ownedNFTs: names, owner }))
  }
}

type Name = string
