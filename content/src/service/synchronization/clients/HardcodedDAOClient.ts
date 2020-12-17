import { ServerAddress } from 'dcl-catalyst-commons'
import { DAOClient } from 'decentraland-katalyst-commons/DAOClient'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata'

export class DAOHardcodedClient implements DAOClient {
  constructor(private readonly servers: ServerAddress[]) {}

  async getAllContentServers(): Promise<Set<ServerMetadata>> {
    const servers: Set<ServerMetadata> = await this.getAllServers()
    return new Set(Array.from(servers.values()).map((server) => ({ ...server, address: server.address + '/content' })))
  }

  getAllServers(): Promise<Set<ServerMetadata>> {
    return Promise.resolve(
      new Set(
        this.servers.map((server, index) => ({
          address: server,
          owner: '0x0000000000000000000000000000000000000000',
          id: `${index}`
        }))
      )
    )
  }
}
