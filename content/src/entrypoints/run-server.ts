import { Server } from "../Server";
import { Environment, Bean } from "../Environment";
import { SynchronizationManager } from "../service/synchronization/SynchronizationManager";
import { DAOClient } from "../service/synchronization/clients/DAOClient";

Environment.getInstance().then(env => {
    new Server(env).start()
    new SynchronizationManager(
        new DAOClient(),
        env.getBean(Bean.NAME_KEEPER),
        env.getBean(Bean.HISTORY_MANAGER),
        env.getBean(Bean.SERVICE)
    )
})
