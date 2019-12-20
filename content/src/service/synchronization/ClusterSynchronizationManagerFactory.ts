import { Environment, Bean, EnvironmentConfig } from "../../Environment";
import { ClusterSynchronizationManager } from "./SynchronizationManager";

export class ClusterSynchronizationManagerFactory {

    static create(env: Environment): ClusterSynchronizationManager {
        return new ClusterSynchronizationManager(env.getBean(Bean.DAO_CLIENT),
            env.getBean(Bean.NAME_KEEPER),
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.SERVICE),
            env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL),
            env.getConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL))
    }

}
