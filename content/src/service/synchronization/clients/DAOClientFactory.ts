import { Environment, EnvironmentConfig } from "../../../Environment";
import { DAOClient } from "decentraland-katalyst-commons/DAOClient";
import { DAOContract } from "decentraland-katalyst-commons/DAOContract";

export class DAOClientFactory {

    static create(env: Environment): DAOClient {
        const contract = DAOContract.withNetwork(env.getConfig(EnvironmentConfig.ETH_NETWORK))
        return new DAOClient(contract)
    }

}
