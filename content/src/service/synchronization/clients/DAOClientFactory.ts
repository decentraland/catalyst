import { DAOClient, DAOContractClient } from '@katalyst/commons'
import { DAOContract } from '@katalyst/contracts'
import { Environment, EnvironmentConfig } from '../../../Environment'
import { DAOHardcodedClient } from './HardcodedDAOClient'

export class DAOClientFactory {
  static create(env: Environment): DAOClient {
    const customDAO: string = env.getConfig(EnvironmentConfig.CUSTOM_DAO) ?? ''
    if (customDAO && customDAO.trim().length !== 0) {
      return new DAOHardcodedClient(customDAO.split(','))
    }
    const contract = DAOContract.withNetwork(env.getConfig(EnvironmentConfig.ETH_NETWORK))
    return new DAOContractClient(contract)
  }
}
