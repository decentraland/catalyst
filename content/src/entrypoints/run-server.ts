import log4js from "log4js"
import { Server } from "../Server";
import { Environment, Bean } from "../Environment";
import { NameKeeper } from "../service/naming/NameKeeper";
import { HistoryManager } from "../service/history/HistoryManager";
import { Timestamp } from "../service/time/TimeSorting";

const LOGGER = log4js.getLogger('ServerRunner');

Environment.getInstance().then(async env => {
    await validateHistory(env)
    await new Server(env).start()
})

async function validateHistory(env: Environment) {
    // Validate last history entry is before Date.now()
    const serverName = (env.getBean(Bean.NAME_KEEPER) as NameKeeper).getServerName()
    const historyManager: HistoryManager = env.getBean(Bean.HISTORY_MANAGER)
    const lastEvents = await historyManager.getHistory(undefined, undefined, serverName, 0, 1)
    if (lastEvents.events.length > 0) {
        const currentTimestamp: Timestamp = Date.now()
        if (lastEvents.events[0].timestamp > currentTimestamp) {
            LOGGER.error("Last stored timestamp for this server is newer than current time. The server can not be started.")
            process.exit(1)
        }
    }
}
