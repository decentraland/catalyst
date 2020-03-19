import { ServerMetadata } from "./ServerMetadata";
import { DAOContract, CatalystId, CatalystData } from "./DAOContract";

export class DAOClient {
  // We will store the server metadata by id. Take into account that the id is unique, and even if we remove and re-add a domain, its id will change
  private servers: Map<CatalystId, ServerMetadata>
  private lastCount: number
  private lastCatalystId: CatalystId

  constructor(private readonly contract: DAOContract, initialServerList?: Map<CatalystId, ServerMetadata>) {
      this.servers = initialServerList ?? new Map()
      this.lastCount = initialServerList?.size ?? 0
      this.lastCatalystId = initialServerList ? Array.from(initialServerList.keys())[this.lastCount - 1] : ""
  }

  async getAllContentServers(): Promise<Set<ServerMetadata>> {
    const servers: Set<ServerMetadata> = await this.getAllServers()
    return new Set(Array.from(servers.values()).map(server => ({ ...server, address: server.address + '/content' })))
  }

  async getAllServers(): Promise<Set<ServerMetadata>> {
    // Check count and last catalyst on the list
    const count = await this.contract.getCount()

    if (count === 0) {
      // Update server list
      this.servers = new Map()

      // Update last catalyst id
      this.lastCatalystId = ""
    } else {
      const lastCatalystId = await this.contract.getCatalystIdByIndex(count - 1)

      if (count !== this.lastCount || lastCatalystId !== this.lastCatalystId) {
        // It is important to understand how the contract works in order to understand why we are doing this. Basically, we want an easy way to detect if there was a change to
        // the server list. Imagine the list is ABCD. Now, if the B is removed from the list, then the last server (in this case D) will take its place, resulting in ADC.
        // Now, if a new server is added, it will be added in the last place. Therefore, when a change happens, either the count is different, or the last server on the list will be different.

        // Create a new list
        const newServers: Map<CatalystId, ServerMetadata> = new Map()

        for (let i = 0; i < count - 1; i++) {
          // Find id in index
          const id = await this.contract.getCatalystIdByIndex(i)

          // Add it to the new server list
          await this.addCatalystToNewServerList(id, newServers)
        }

        // Add the last catalyst also
        await this.addCatalystToNewServerList(lastCatalystId, newServers)

        // Update server list
        this.servers = newServers

        // Update last catalyst id
        this.lastCatalystId = lastCatalystId
      }
    }
    this.lastCount = count
    return new Set(this.servers.values())
  }

  private async addCatalystToNewServerList(id: CatalystId, newServers: Map<CatalystId, ServerMetadata>): Promise<void> {
    // Check if id is known
    let metadata = this.servers.get(id)

    // If it isn't, then calculate it
    if (!metadata) {
      const data = await this.contract.getServerData(id)
      metadata = this.toMetadata(data)
    }

    // If metadata is defined, then store it
    if (metadata) {
      newServers.set(id, metadata)
    }
  }

  private toMetadata(data: CatalystData): ServerMetadata | undefined {
    const { id, owner, domain } = data

    let address = domain.trim()

    if (address.startsWith("http://")) {
      console.warn(`Catalyst node domain using http protocol, skipping ${address}`);
      return undefined
    }

    if (!address.startsWith("https://")) {
        address = "https://" + address;
    }

    return { address, owner, id };
  }

}
