import { CatalystByIdResult, getAllCatalystFromProvider } from '@dcl/catalyst-contracts'
import { hexToBytes } from 'eth-connect'
import { AppComponents } from '../types'

export interface DAOComponent {
  getAllContentServers(): Promise<Array<CatalystByIdResult>>
  getAllServers(): Promise<Array<CatalystByIdResult>>
}

export function createDAOComponent(components: Pick<AppComponents, 'l1Provider'>): DAOComponent {
  async function getAllContentServers(): Promise<Array<CatalystByIdResult>> {
    const servers = await getAllServers()
    return servers.map((server) => ({ ...server, domain: server.domain + '/content' }))
  }

  async function getAllServers(): Promise<Array<CatalystByIdResult>> {
    return await getAllCatalystFromProvider(components.l1Provider)
  }

  return {
    getAllContentServers,
    getAllServers
  }
}

export function createCustomDAOComponent(customDAOServers: string): DAOComponent {
  const servers = customDAOServers.split(',')

  async function getAllContentServers(): Promise<Array<CatalystByIdResult>> {
    const servers = await getAllServers()
    return servers.map((server) => ({ ...server, domain: server.domain + '/content' }))
  }

  async function getAllServers(): Promise<Array<CatalystByIdResult>> {
    return servers.map((server, index) => ({
      domain: server,
      owner: '0x0000000000000000000000000000000000000000',
      id: hexToBytes(`${index.toString(16)}`)
    }))
  }

  return {
    getAllContentServers,
    getAllServers
  }
}
