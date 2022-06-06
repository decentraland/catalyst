import { CatalystByIdResult, getAllCatalystFromProvider } from '@dcl/catalyst-contracts'
import { HTTPProvider, hexToBytes } from 'eth-connect'

export interface DaoComponent {
  getAllContentServers(): Promise<Array<CatalystByIdResult>>
  getAllServers(): Promise<Array<CatalystByIdResult>>
}

export class DAOClient implements DaoComponent {
  constructor(private provider: HTTPProvider) {}

  async getAllContentServers(): Promise<Array<CatalystByIdResult>> {
    const servers = await this.getAllServers()
    return servers.map((server) => ({ ...server, domain: server.domain + '/content' }))
  }

  async getAllServers(): Promise<Array<CatalystByIdResult>> {
    return await getAllCatalystFromProvider(this.provider)
  }
}

export class DAOHardcodedClient implements DaoComponent {
  constructor(private readonly servers: string[]) {}

  async getAllContentServers(): Promise<Array<CatalystByIdResult>> {
    const servers = await this.getAllServers()
    return servers.map((server) => ({ ...server, address: server.domain + '/content' }))
  }

  async getAllServers(): Promise<Array<CatalystByIdResult>> {
    return this.servers.map((server, index) => ({
      domain: server,
      owner: '0x0000000000000000000000000000000000000000',
      id: hexToBytes(`${index.toString(16)}`)
    }))
  }
}
