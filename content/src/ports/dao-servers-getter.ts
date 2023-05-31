import {
  catalystAbi,
  CatalystContract,
  CatalystServerInfo,
  getCatalystServersFromDAO,
  l1Contracts,
  L1Network
} from '@dcl/catalyst-contracts'
import RequestManager, { ContractFactory } from 'eth-connect'
import { AppComponents } from '../types'

export interface DAOComponent {
  getAllContentServers(): Promise<CatalystServerInfo[]>
  getAllServers(): Promise<CatalystServerInfo[]>
}

export async function createDAOComponent(
  components: Pick<AppComponents, 'l1Provider'>,
  network: L1Network
): Promise<DAOComponent> {
  const requestManager = new RequestManager(components.l1Provider)
  const catalystContract: CatalystContract = (await new ContractFactory(requestManager, catalystAbi).at(
    l1Contracts[network].catalyst
  )) as any

  async function getAllContentServers(): Promise<CatalystServerInfo[]> {
    const servers = await getAllServers()
    return servers.map((server) => ({ ...server, address: server.address + '/content' }))
  }

  async function getAllServers(): Promise<CatalystServerInfo[]> {
    return getCatalystServersFromDAO(catalystContract)
  }

  return {
    getAllContentServers,
    getAllServers
  }
}

export function createCustomDAOComponent(customDAOServers: string): DAOComponent {
  const servers = customDAOServers.split(',')

  async function getAllContentServers(): Promise<CatalystServerInfo[]> {
    const servers = await getAllServers()
    return servers.map((server) => ({ ...server, address: server.address + '/content' }))
  }

  async function getAllServers(): Promise<CatalystServerInfo[]> {
    return servers.map((server, index) => ({
      address: server,
      owner: '0x0000000000000000000000000000000000000000',
      id: `${index.toString(16)}`
    }))
  }

  return {
    getAllContentServers,
    getAllServers
  }
}
