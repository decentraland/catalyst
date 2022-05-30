import { Environment, EnvironmentConfig } from '../../../Environment'
import { DAOClient, DaoComponent, DAOHardcodedClient } from './HardcodedDAOClient'
import { HTTPProvider } from 'eth-connect'

export class DAOClientFactory {
  static async create(env: Environment, ethereumProvider: HTTPProvider): Promise<DaoComponent> {
    const customDAO: string = env.getConfig(EnvironmentConfig.CUSTOM_DAO) ?? ''
    if (customDAO && customDAO.trim().length !== 0) {
      return new DAOHardcodedClient(customDAO.split(','))
    }

    return new DAOClient(ethereumProvider)
  }
}
