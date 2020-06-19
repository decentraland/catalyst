import { Environment, Bean, EnvironmentConfig } from "../../Environment";
import { ContentCluster } from "./ContentCluster";

export class ContentClusterFactory {

    static create(env: Environment): ContentCluster {
        return new ContentCluster(
            env.getBean(Bean.DAO_CLIENT),
            env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL),
            env.getBean(Bean.CHALLENGE_SUPERVISOR),
            env.getBean(Bean.FETCHER),
            env.getBean(Bean.SYSTEM_PROPERTIES_MANAGER),
            env.getConfig(EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH))
    }
}