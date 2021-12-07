import { DAOClient, ServerMetadata } from '@catalyst/commons'
import { ServerBaseUrl } from 'dcl-catalyst-commons'

export class DAOHardcodedClient implements DAOClient {
  constructor(private readonly servers: ServerBaseUrl[]) {}

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
