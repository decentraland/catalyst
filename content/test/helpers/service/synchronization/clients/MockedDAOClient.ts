import { DAOClient, ServerBaseUrl, ServerMetadata } from '@catalyst/commons'
import { EthAddress } from 'dcl-crypto'

export class MockedDAOClient implements DAOClient {
  private readonly serversByAddress: Map<ServerBaseUrl, ServerMetadata>

  private constructor(servers: { baseUrl: ServerBaseUrl; owner: EthAddress }[]) {
    this.serversByAddress = new Map(servers.map((server) => [server.baseUrl, { ...server, id: 'Id' }]))
  }

  async getAllServers(): Promise<Set<ServerMetadata>> {
    return new Set(this.serversByAddress.values())
  }

  add(baseUrl: ServerBaseUrl) {
    this.serversByAddress.set(baseUrl, { baseUrl, owner: '0x...', id: 'Id' })
  }

  remove(baseUrl: ServerBaseUrl) {
    this.serversByAddress.delete(baseUrl)
  }

  static withAddresses(...servers: ServerBaseUrl[]): MockedDAOClient {
    return new MockedDAOClient(servers.map((baseUrl) => ({ baseUrl, owner: '0x...' })))
  }

  static with(baseUrl: ServerBaseUrl, owner: EthAddress): MockedDAOClient {
    return new MockedDAOClient([{ baseUrl, owner }])
  }
}
