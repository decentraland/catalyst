import { DAOClient, ServerMetadata } from '@catalyst/commons'
import { ServerAddress } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'

export class MockedDAOClient implements DAOClient {
  private readonly serversByAddress: Map<ServerAddress, ServerMetadata>

  private constructor(servers: { baseUrl: ServerAddress; owner: EthAddress }[]) {
    this.serversByAddress = new Map(servers.map((server) => [server.baseUrl, { ...server, id: 'Id' }]))
  }

  async getAllServers(): Promise<Set<ServerMetadata>> {
    return new Set(this.serversByAddress.values())
  }

  add(baseUrl: ServerAddress) {
    this.serversByAddress.set(baseUrl, { baseUrl, owner: '0x...', id: 'Id' })
  }

  remove(baseUrl: ServerAddress) {
    this.serversByAddress.delete(baseUrl)
  }

  static withAddresses(...servers: ServerAddress[]): MockedDAOClient {
    return new MockedDAOClient(servers.map((baseUrl) => ({ baseUrl, owner: '0x...' })))
  }

  static with(baseUrl: ServerAddress, owner: EthAddress): MockedDAOClient {
    return new MockedDAOClient([{ baseUrl, owner }])
  }
}
