import { ServerAddress } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { DAOClient } from 'decentraland-katalyst-commons/DAOClient'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata'

export class MockedDAOClient implements DAOClient {
  private readonly serversByAddress: Map<ServerAddress, ServerMetadata>

  private constructor(servers: { address: ServerAddress; owner: EthAddress }[]) {
    this.serversByAddress = new Map(servers.map((server) => [server.address, { ...server, id: 'Id' }]))
  }

  async getAllContentServers(): Promise<Set<ServerMetadata>> {
    return new Set(this.serversByAddress.values())
  }

  async getAllServers(): Promise<Set<ServerMetadata>> {
    throw new Error('Not Implemented')
  }

  add(address: ServerAddress) {
    this.serversByAddress.set(address, { address, owner: '0x...', id: 'Id' })
  }

  remove(address: ServerAddress) {
    this.serversByAddress.delete(address)
  }

  static withAddresses(...addresses: ServerAddress[]): MockedDAOClient {
    return new MockedDAOClient(addresses.map((address) => ({ address, owner: '0x...' })))
  }
  static with(address: ServerAddress, owner: EthAddress): MockedDAOClient {
    return new MockedDAOClient([{ address, owner }])
  }
}
