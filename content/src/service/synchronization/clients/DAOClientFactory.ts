import { Environment, EnvironmentConfig } from '../../../Environment'
import { DAOClient, DaoComponent, DAOHardcodedClient } from './HardcodedDAOClient'
import { ethers } from 'ethers'

export class DAOClientFactory {
  static async create(env: Environment, ethereumProvider: ethers.providers.Provider): Promise<DaoComponent> {
    const customDAO: string = env.getConfig(EnvironmentConfig.CUSTOM_DAO) ?? ''
    if (customDAO && customDAO.trim().length !== 0) {
      return new DAOHardcodedClient(customDAO.split(','))
    }

    return new DAOClient(ethereumProvider)
  }
}
