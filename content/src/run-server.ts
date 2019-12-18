import { Server } from "./Server";
import { Environment, Bean } from "./Environment";
import { SynchronizationManager } from "./service/synchronization/SynchronizationManager";
import { DAOClient } from "./service/synchronization/DAOClient";

Environment.getInstance().then(env => {
    new Server(env).start()
    new SynchronizationManager(
        new DAOClient(),
        env.getBean(Bean.NAMING),
        env.getBean(Bean.HISTORY_MANAGER),
        env.getBean(Bean.SERVICE)
    )
})
