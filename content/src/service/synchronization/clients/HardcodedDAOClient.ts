import { CatalystByIdResult, getAllCatalystFromProvider } from '@dcl/catalyst-contracts'
import { HTTPProvider, hexToBytes } from 'eth-connect'

export interface DaoComponent {
  getAllContentServers(): Promise<Set<CatalystByIdResult>>
  getAllServers(): Promise<Set<CatalystByIdResult>>
}

export class DAOClient implements DaoComponent {
  constructor(private provider: HTTPProvider) {}

  async getAllContentServers(): Promise<Set<CatalystByIdResult>> {
    const servers: Set<CatalystByIdResult> = await this.getAllServers()
    return new Set(Array.from(servers.values()).map((server) => ({ ...server, address: server.domain + '/content' })))
  }

  async getAllServers(): Promise<Set<CatalystByIdResult>> {
    return new Set(await getAllCatalystFromProvider(this.provider))
  }
}

export class DAOHardcodedClient implements DaoComponent {
  constructor(private readonly servers: string[]) {}

  async getAllContentServers(): Promise<Set<CatalystByIdResult>> {
    const servers: Set<CatalystByIdResult> = await this.getAllServers()
    return new Set(Array.from(servers.values()).map((server) => ({ ...server, address: server.domain + '/content' })))
  }

  getAllServers(): Promise<Set<CatalystByIdResult>> {
    return Promise.resolve(
      new Set(
        this.servers.map((server, index) => ({
          domain: server,
          owner: '0x0000000000000000000000000000000000000000',
          id: hexToBytes(`${index.toString(16)}`)
        }))
      )
    )
  }
}
