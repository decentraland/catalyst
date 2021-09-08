import { List } from './List'
import { handlerForNetwork } from './utils'

export class DAOListContract {
  private constructor(private readonly contract: List) {}

  /*
    Returns the count of elements in the list.
    */
  async getCount(): Promise<number> {
    return parseInt(await this.contract.methods.size().call())
  }

  /*
    Returns the value for the specified index. 0 <= index < getCount()
    */
  getValueByIndex(index: number): Promise<string> {
    return this.contract.methods.get(index).call()
  }

  static withNetwork(networkName: string, contractKey: DAOListContractsKeys): DAOListContract {
    const handler = handlerForNetwork(networkName, contractKey)
    if (handler) {
      return new DAOListContract(handler.contract)
    } else {
      throw new Error(`Can not find a network handler for Network="${networkName}" and Contract Key="${contractKey}"`)
    }
  }
}

export enum DAOListContractsKeys {
  POIs = 'POIs',
  denylistedNames = 'denylistedNames'
}
