import { CatalystData, CatalystId, DAOContract } from '@catalyst/contracts'
import { ServerMetadata } from './ServerMetadata'

export interface DAOClient {
  getAllServers(): Promise<Set<ServerMetadata>>
}

export class DAOContractClient {
  // We will store the server metadata by id. Take into account that the id is unique, and even if we remove and re-add a domain, its id will change
  private servers: Map<CatalystId, ServerMetadata>

  constructor(private readonly contract: DAOContract, initialServerList?: Map<CatalystId, ServerMetadata>) {
    this.servers = initialServerList ?? new Map()
  }

  async getAllServers(): Promise<Set<ServerMetadata>> {
    // Check count on the list
    const count = await this.contract.getCount()

    // Create a new list
    const newServers: Map<CatalystId, ServerMetadata> = new Map()

    for (let i = 0; i < count; i++) {
      // Find id in index
      const id = await this.contract.getCatalystIdByIndex(i)

      // Check if id is known
      let metadata = this.servers.get(id)

      // If it isn't known, then calculate it
      if (!metadata) {
        const data = await this.contract.getServerData(id)
        metadata = this.toMetadata(data)
      }

      // If metadata is defined, then store it
      if (metadata) {
        newServers.set(id, metadata)
      }
    }

    this.servers = newServers
    return new Set(this.servers.values())
  }

  /**
   * Converts the data from the contract into something more useful.
   * Returns undefined if the data from the contract is invalid.
   */
  private toMetadata(data: CatalystData): ServerMetadata | undefined {
    const { id, owner, domain } = data

    let address = domain.trim()

    if (address.startsWith('http://')) {
      console.warn(`Catalyst node domain using http protocol, skipping ${address}`)
      return undefined
    }

    if (!address.startsWith('https://')) {
      address = 'https://' + address
    }

    return { baseUrl: address, owner, id }
  }
}
