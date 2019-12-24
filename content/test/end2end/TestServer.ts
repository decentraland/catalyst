import { Server } from "../../src/Server"
import { Environment, EnvironmentConfig, EnvironmentBuilder, Bean } from "../../src/Environment"
import { ServerAddress } from "../../src/service/synchronization/clients/ContentServerClient"
import { MockedContentAnalytics } from "../service/analytics/MockedContentAnalytics"
import { DAOClient } from "../../src/service/synchronization/clients/DAOClient"

/** A server that helps make tests more easily */
export class TestServer extends Server {

    private serverPort: number
    private started: boolean = false
    public readonly namePrefix: string
    public readonly storageFolder: string

    private constructor(env: Environment) {
        super(env)
        this.serverPort = env.getConfig(EnvironmentConfig.SERVER_PORT)
        this.namePrefix = env.getConfig(EnvironmentConfig.NAME_PREFIX)
        this.storageFolder = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER)
    }

    getAddress(): ServerAddress {
        return `localhost:${this.serverPort}`
    }

    start(): Promise<void> {
        this.started = true
        return super.start()
    }

    stop(): Promise<void> {
        if (this.started) {
            return super.stop()
        } else {
            return Promise.resolve()
        }
    }

    static async buildServer(namePrefix: string, port: number, syncInterval: number, daoClient: DAOClient) {
        const env: Environment = await new EnvironmentBuilder()
            .withConfig(EnvironmentConfig.NAME_PREFIX, namePrefix)
            .withConfig(EnvironmentConfig.SERVER_PORT, port)
            .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, "storage_" + namePrefix)
            .withConfig(EnvironmentConfig.LOG_REQUESTS, false)
            .withConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, syncInterval)
            .withBean(Bean.DAO_CLIENT, daoClient)
            .withAnalytics(new MockedContentAnalytics())
            .build()
        return new TestServer(env)
    }

}