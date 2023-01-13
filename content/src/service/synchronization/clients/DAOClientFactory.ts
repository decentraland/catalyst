import { Environment, EnvironmentConfig } from '../../../Environment'
import { DAOClient, DaoComponent, DAOHardcodedClient } from './HardcodedDAOClient'
import { IWeb3Component } from 'src/ports/web3'

export class DAOClientFactory {
  static async create(env: Environment, web3: IWeb3Component): Promise<DaoComponent> {
    const customDAO: string = env.getConfig(EnvironmentConfig.CUSTOM_DAO) ?? ''
    if (customDAO && customDAO.trim().length !== 0) {
      return new DAOHardcodedClient(customDAO.split(','))
    }

    return new DAOClient(web3)
  }
}
