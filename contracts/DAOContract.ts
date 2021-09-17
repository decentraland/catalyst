import { EthAddress } from 'dcl-crypto'
import { Catalyst } from './Catalyst'
import { handlerForNetwork } from './utils'

export class DAOContract {
  private constructor(private readonly contract: Catalyst) {}

  async getCount(): Promise<number> {
    return parseInt(await this.contract.methods.catalystCount().call())
  }

  getCatalystIdByIndex(index: number): Promise<CatalystId> {
    return this.contract.methods.catalystIds(index).call()
  }

  async getServerData(catalystId: CatalystId): Promise<CatalystData> {
    const { id, owner, domain } = await this.contract.methods.catalystById(catalystId).call()
    return { id, domain, owner: owner.toJSON() }
  }

  static withNetwork(networkName: string): DAOContract {
    const handler = handlerForNetwork(networkName, 'catalyst')
    if (handler) {
      const { contract } = handler
      return new DAOContract(contract)
    } else {
      throw new Error(`Can not find a network handler for Network="${networkName}`)
    }
  }
}

export type CatalystId = string
export type CatalystData = {
  id: CatalystId
  owner: EthAddress
  domain: string
}
