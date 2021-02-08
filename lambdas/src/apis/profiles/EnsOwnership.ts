import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { NFTOwnership } from './NFTOwnership'

export class EnsOwnership extends NFTOwnership {
  constructor(private readonly theGraphClient: TheGraphClient, maxSize: number, maxAge: number) {
    super(maxSize, maxAge)
  }

  /** This method will take a list of names and return only those that are owned by the given eth address */
  protected async querySubgraph(names: Name[]) {
    const result = await this.theGraphClient.findOwnersByName(names)
    return result.map(({ name, owner }) => ({ nft: name, owner }))
  }
}

type Name = string
