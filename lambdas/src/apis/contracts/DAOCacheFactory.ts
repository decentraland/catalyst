import { Environment, EnvironmentConfig } from '../../Environment'
import { DAOCache } from './DAOCache';
import { DAOContractClient } from "decentraland-katalyst-commons/DAOClient";
import { DAOContract } from "decentraland-katalyst-contracts/DAOContract";

export class DAOCacheFactory {

    static create(env: Environment): DAOCache {
        const daoContract: DAOContract = DAOContract.withNetwork(env.getConfig(EnvironmentConfig.ETH_NETWORK))
        const daoClient = new DAOContractClient(daoContract);
        return new DAOCache(daoClient)
    }

}