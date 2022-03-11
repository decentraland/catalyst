import { DAOClient, ServerBaseUrl, ServerMetadata } from '@dcl/catalyst-node-commons'

export class DAOHardcodedClient implements DAOClient {
  constructor(private readonly servers: ServerBaseUrl[]) {}

  async getAllContentServers(): Promise<Set<ServerMetadata>> {
    const servers: Set<ServerMetadata> = await this.getAllServers()
    return new Set(Array.from(servers.values()).map((server) => ({ ...server, address: server.baseUrl + '/content' })))
  }

  getAllServers(): Promise<Set<ServerMetadata>> {
    return Promise.resolve(
      new Set(
        this.servers.map((server, index) => ({
          baseUrl: server,
          owner: '0x0000000000000000000000000000000000000000',
          id: `${index}`
        }))
      )
    )
  }
}
