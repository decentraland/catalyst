import { CatalystByIdResult, getAllCatalystFromProvider } from '@dcl/catalyst-contracts'
import { hexToBytes } from 'eth-connect'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export interface DAOComponent {
  getAllContentServers(): Promise<Array<CatalystByIdResult>>
  getAllServers(): Promise<Array<CatalystByIdResult>>
}

function usingCustomDAO(customDAO: string): boolean {
  return !!customDAO && !!customDAO.trim().length
}

function customDAOImplementations(customDAO: string): DAOComponent {
  const servers = customDAO.split(',')
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

export function createDAOComponent(components: Pick<AppComponents, 'env' | 'l1Provider'>): DAOComponent {
  const { env, l1Provider } = components
  const customDAO: string = env.getConfig(EnvironmentConfig.CUSTOM_DAO) ?? ''

  if (usingCustomDAO(customDAO)) {
    return customDAOImplementations(customDAO)
  } else {
    async function getAllContentServers(): Promise<Array<CatalystByIdResult>> {
      const servers = await getAllServers()
      return servers.map((server) => ({ ...server, domain: server.domain + '/content' }))
    }

    async function getAllServers(): Promise<Array<CatalystByIdResult>> {
      return await getAllCatalystFromProvider(l1Provider)
    }

    return {
      getAllContentServers,
      getAllServers
    }
  }
}
