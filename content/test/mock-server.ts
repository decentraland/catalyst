import { EnvironmentBuilder } from "../src/Environment"
import { MockedService } from "./service/MockedService"
import { Server } from "../src/Server"

async function execute() {
    const env = await new EnvironmentBuilder().withService(new MockedService()).build()
    new Server(env).start()
}

execute()
.catch(reason => console.error(reason))
