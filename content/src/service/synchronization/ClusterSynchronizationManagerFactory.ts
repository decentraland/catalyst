import { DAOClient } from "./clients/DAOClient";
import { Environment, Bean } from "../../Environment";
import { ClusterSynchronizationManager } from "./SynchronizationManager";

export class ClusterSynchronizationManagerFactory {

    static create(env: Environment): ClusterSynchronizationManager {
        return new ClusterSynchronizationManager(new DAOClient(),
            env.getBean(Bean.NAME_KEEPER),
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.SERVICE))
    }

}
