import { Environment, EnvironmentConfig } from "../../../Environment";
import { DAOClient } from "./DAOClient";

export class DAOClientFactory {

    static create(env: Environment): DAOClient {
        return new DAOClient(env.getConfig(EnvironmentConfig.ETH_NETWORK))
    }

}
