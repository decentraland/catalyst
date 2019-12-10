import { Environment, STORAGE_ROOT_FOLDER, SERVER_PORT, Bean } from "../src/Environment"
import { ContentStorageFactory } from "../src/storage/ContentStorageFactory"
import { MockedService } from "./service/MockedService"
import { ControllerFactory } from "../src/controller/ControllerFactory"
import { Server } from "../src/Server"

const env = new Environment()

env.setConfig(STORAGE_ROOT_FOLDER, "storage")
env.setConfig(SERVER_PORT, process.env.PORT ?? 6969)

env.registerBean(Bean.STORAGE, ContentStorageFactory.local(env))
env.registerBean(Bean.SERVICE, new MockedService())
env.registerBean(Bean.CONTROLLER, ControllerFactory.create(env))

new Server(env).start()