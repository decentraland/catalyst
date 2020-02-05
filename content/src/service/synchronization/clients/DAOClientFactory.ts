import { Environment, EnvironmentConfig } from "../../../Environment";
import { DAOClient } from "decentraland-katalyst-commons/src/DAOClient";

export class DAOClientFactory {

    static create(env: Environment): DAOClient {
        return new DAOClient(env.getConfig(EnvironmentConfig.ETH_NETWORK))
    }

}
