import { Fetcher } from "dcl-catalyst-commons"
import { EnvironmentConfig, Environment } from "../Environment"

export class FetcherFactory {

    static create(env: Environment): Fetcher {
        const jsonRequestTimeout = env.getConfig<string>(EnvironmentConfig.JSON_REQUEST_TIMEOUT)
        const fileDownloadTimeout = env.getConfig<string>(EnvironmentConfig.FILE_DOWNLOAD_REQUEST_TIMEOUT)
        return new Fetcher(jsonRequestTimeout, fileDownloadTimeout)
    }
}
