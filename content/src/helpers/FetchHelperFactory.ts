import { EnvironmentConfig, Environment } from "../Environment"
import { FetchHelper } from "./FetchHelper"


export class FetchHelperFactory {

    static create(env: Environment): FetchHelper {
        return new FetchHelper(env.getConfig(EnvironmentConfig.JSON_REQUEST_TIMEOUT), env.getConfig(EnvironmentConfig.FILE_DOWNLOAD_REQUEST_TIMEOUT))
    }
}
