import {
  catalystAbi,
  CatalystByIdResult,
  CatalystContract,
  CatalystServerInfo,
  getCatalystServersFromDAO,
  l1Contracts,
  L1Network
} from '@dcl/catalyst-contracts'
import RequestManager, { ContractFactory } from 'eth-connect'
import { AppComponents } from '../../types'

/**
 * Read-only source of the catalyst DAO's server list. Private to peer-cluster — the
 * cluster owns the choice between the on-chain DAO and the custom static fallback,
 * and is the only consumer of either implementation.
 */
export interface DAOSource {
  getAllContentServers(): Promise<CatalystServerInfo[]>
  getAllServers(): Promise<CatalystServerInfo[]>
}

export async function createDAOSource(
  components: Pick<AppComponents, 'l1Provider'>,
  network: L1Network
): Promise<DAOSource> {
  const requestManager = new RequestManager(components.l1Provider)
  const contract = (await new ContractFactory(requestManager, catalystAbi).at(l1Contracts[network].catalyst)) as any

  const catalystContract: CatalystContract = {
    async catalystCount(): Promise<number> {
      return contract.catalystCount()
    },
    async catalystIds(i: number): Promise<string> {
      return contract.catalystIds(i)
    },
    async catalystById(catalystId: string): Promise<CatalystByIdResult> {
      const { id, owner, address } = await contract.catalystById(catalystId)
      return { id, owner, domain: address }
    }
  }

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

export function createCustomDAOSource(customDAOServers: string): DAOSource {
  // Trim and drop empties so a trailing comma or padded entry ("a, b,") doesn't produce a garbage
  // peer URL (e.g. "" → "/content") that the synchronizer then endlessly fails to fetch.
  const servers = customDAOServers
    .split(',')
    .map((server) => server.trim())
    .filter((server) => server.length > 0)

  async function getAllContentServers(): Promise<CatalystServerInfo[]> {
    const all = await getAllServers()
    return all.map((server) => ({ ...server, address: server.address + '/content' }))
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
