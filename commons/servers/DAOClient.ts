import { CatalystData, CatalystId, DAOContract } from '@dcl/catalyst-contracts'
import { ServerMetadata } from './ServerMetadata'

export interface DAOClient {
  getAllContentServers(): Promise<Set<ServerMetadata>>
  getAllServers(): Promise<Set<ServerMetadata>>
}

export class DAOContractClient {
  // We will store the server metadata by id. Take into account that the id is unique, and even if we remove and re-add a domain, its id will change
  private servers: Map<CatalystId, ServerMetadata>

  constructor(private readonly contract: DAOContract, initialServerList?: Map<CatalystId, ServerMetadata>) {
    this.servers = initialServerList ?? new Map()
  }

  async getAllContentServers(): Promise<Set<ServerMetadata>> {
    const servers: Set<ServerMetadata> = await this.getAllServers()
    return new Set(Array.from(servers.values()).map((server) => ({ ...server, baseUrl: server.baseUrl + '/content' })))
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

    let baseUrl = domain.trim()

    if (baseUrl.startsWith('http://')) {
      console.warn(`Catalyst node domain using http protocol, skipping ${baseUrl}`)
      return undefined
    }

    if (!baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl
    }

    return { baseUrl, owner, id }
  }
}
