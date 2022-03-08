import { DAOListContract } from '@dcl/catalyst-contracts'

export interface DAOListClient {
  getAllValues(): Promise<Set<string>>
}

export class DAOListContractClient {
  constructor(private readonly contract: DAOListContract) { }

  async getAllValues(): Promise<Set<string>> {
    const count = await this.contract.getCount()
    const values: Set<string> = new Set()
    for (let i = 0; i < count; i++) {
      const value = await this.contract.getValueByIndex(i)
      if (value) {
        values.add(value)
      }
    }
    return values
  }
}
