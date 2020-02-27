import { Environment, Bean, EnvironmentConfig } from "../../Environment";
import { ClusterSynchronizationManager } from "./SynchronizationManager";

export class ClusterSynchronizationManagerFactory {

    static create(env: Environment): ClusterSynchronizationManager {
        return new ClusterSynchronizationManager(
            env.getBean(Bean.CONTENT_CLUSTER),
            env.getBean(Bean.SERVICE),
            env.getBean(Bean.EVENT_DEPLOYER),
            env.getConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL),
            env.getConfig(EnvironmentConfig.PERFORM_MULTI_SERVER_ONBOARDING),
            env.getConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS))
    }

}
