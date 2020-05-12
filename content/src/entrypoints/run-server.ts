import log4js from "log4js"
import { Server } from "../Server";
import { Environment, Bean } from "../Environment";
import { Timestamp } from "../service/time/TimeSorting";
import { Repository } from "../storage/Repository";

const LOGGER = log4js.getLogger('ServerRunner');

Environment.getInstance()
.then(async env => {
    await validateHistory(env)
    await new Server(env).start()
})
.catch(error => {
    console.log("Can not start server. " + error)
    process.exit(1)
})

async function validateHistory(env: Environment) {
    // Validate last history entry is before Date.now()
    const repository: Repository = env.getBean(Bean.REPOSITORY)
    const lastEvents = await repository.deployments.getHistoricalDeploymentsByLocalTimestamp(0, 1)
    if (lastEvents.length > 0) {
        const currentTimestamp: Timestamp = Date.now()
        if (lastEvents[0].localTimestamp > currentTimestamp) {
            LOGGER.error("Last stored timestamp for this server is newer than current time. The server can not be started.")
            process.exit(1)
        }
    }
}
