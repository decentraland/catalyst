import { CatalystServerInfo } from '@dcl/catalyst-contracts'
import { EthAddress } from '@dcl/crypto'
import { DAOComponent } from '../../../../../src/ports/dao-servers-getter'

export class MockedDAOClient implements DAOComponent {
  private readonly serversByAddress: Map<string, CatalystServerInfo>

  private constructor(servers: { address: string; owner: EthAddress }[]) {
    this.serversByAddress = new Map(servers.map((server) => [server.address, { ...server, id: '0' }]))
  }

  async getAllContentServers(): Promise<Array<CatalystServerInfo>> {
    return Array.from(this.serversByAddress.values())
  }

  async getAllServers(): Promise<Array<CatalystServerInfo>> {
    throw new Error('Not Implemented')
  }

  add(baseUrl: string) {
    this.serversByAddress.set(baseUrl, { address: baseUrl, owner: '0xCatalyst_owner_address_1', id: '0' })
  }

  remove(baseUrl: string) {
    this.serversByAddress.delete(baseUrl)
  }

  static withAddresses(...servers: string[]): MockedDAOClient {
    return new MockedDAOClient(servers.map((address) => ({ address, owner: '0xCatalyst_owner_address_0' })))
  }

  static with(baseUrl: string, owner: EthAddress): MockedDAOClient {
    return new MockedDAOClient([{ address: baseUrl, owner }])
  }
}
