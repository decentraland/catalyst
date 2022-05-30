import { CatalystByIdResult } from '@dcl/catalyst-contracts';
import { EthAddress } from '@dcl/crypto';
import { DaoComponent } from '../../../../../src/service/synchronization/clients/HardcodedDAOClient';

export class MockedDAOClient implements DaoComponent {
  private readonly serversByAddress: Map<string, CatalystByIdResult>

  private constructor(servers: { domain: string; owner: EthAddress }[]) {
    this.serversByAddress = new Map(servers.map((server) => [server.domain, { ...server, id: new Uint8Array() }]))
  }

  async getAllContentServers(): Promise<Set<CatalystByIdResult>> {
    return new Set(this.serversByAddress.values())
  }

  async getAllServers(): Promise<Set<CatalystByIdResult>> {
    throw new Error('Not Implemented')
  }

  add(baseUrl: string) {
    this.serversByAddress.set(baseUrl, { domain: baseUrl, owner: '0xCatalyst_owner_address_1', id: new Uint8Array() })
  }

  remove(baseUrl: string) {
    this.serversByAddress.delete(baseUrl)
  }

  static withAddresses(...servers: string[]): MockedDAOClient {
    return new MockedDAOClient(servers.map((domain) => ({ domain, owner: '0xCatalyst_owner_address_0' })))
  }

  static with(baseUrl: string, owner: EthAddress): MockedDAOClient {
    return new MockedDAOClient([{ domain: baseUrl, owner }])
  }
}
