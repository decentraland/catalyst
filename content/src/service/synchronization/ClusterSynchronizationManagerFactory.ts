import { Environment, Bean, EnvironmentConfig } from "../../Environment";
import { ClusterSynchronizationManager } from "./SynchronizationManager";

export class ClusterSynchronizationManagerFactory {

    static create(env: Environment): ClusterSynchronizationManager {
        return new ClusterSynchronizationManager(
            env.getBean(Bean.CONTENT_CLUSTER),
            env.getBean(Bean.SYSTEM_PROPERTIES_MANAGER),
            env.getBean(Bean.EVENT_DEPLOYER),
            env.getConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL))
    }

}
