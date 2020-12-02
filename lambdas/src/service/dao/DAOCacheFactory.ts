import { Environment, EnvironmentConfig } from '../../Environment'
import { DAOCache } from './DAOCache'
import { DAOContractClient } from 'decentraland-katalyst-commons/DAOClient'
import { DAOContract } from 'decentraland-katalyst-contracts/DAOContract'
import { DAOListContractClient } from './DAOListsClient'
import { DAOListContract, DAOListContractsKeys } from 'decentraland-katalyst-contracts/DAOListContract'

export class DAOCacheFactory {
  static create(env: Environment): DAOCache {
    const networkName: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)
    const daoClient = new DAOContractClient(DAOContract.withNetwork(networkName))
    const poisClient = new DAOListContractClient(DAOListContract.withNetwork(networkName, DAOListContractsKeys.POIs))
    const denylistedNamesClient = new DAOListContractClient(
      DAOListContract.withNetwork(networkName, DAOListContractsKeys.denylistedNames)
    )
    return new DAOCache(daoClient, poisClient, denylistedNamesClient)
  }
}
