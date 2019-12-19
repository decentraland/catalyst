import { EnvironmentBuilder } from "../src/Environment"
import { MockedService } from "./service/MockedService"
import { Server } from "../src/Server"
import { MockedSynchronizationManager } from "./service/synchronization/MockedSynchronizationManager"

async function execute() {
    const env = await new EnvironmentBuilder()
        .withService(new MockedService())
        .withSynchronizationManager(new MockedSynchronizationManager())
        .build()
    await new Server(env).start()
}

execute()
.catch(reason => console.error(reason))
