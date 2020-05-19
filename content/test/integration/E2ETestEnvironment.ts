import ms from 'ms'
import { random } from 'faker'
import { StartedTestContainer, GenericContainer } from "testcontainers"
import { DEFAULT_DATABASE_CONFIG, Environment, EnvironmentConfig, Bean, EnvironmentBuilder } from '@katalyst/content/Environment'
import { RepositoryFactory } from '@katalyst/content/storage/RepositoryFactory'
import { Repository } from '@katalyst/content/storage/Repository'
import { TestServer } from './TestServer'
import { MockedDAOClient } from '@katalyst/test-helpers/service/synchronization/clients/MockedDAOClient'
import { NoOpDeploymentReporter } from '@katalyst/content/service/reporters/NoOpDeploymentReporter'
import { MockedAccessChecker } from '@katalyst/test-helpers/service/access/MockedAccessChecker'
import { ServerAddress } from '@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient'

export class E2ETestEnvironment {

    private static TEST_SCHEMA = 'e2etest'
    private static POSTGRES_PORT = 5432
    private runningServers: TestServer[]
    private postgresContainer: StartedTestContainer
    private repository: Repository
    private sharedEnv: Environment
    private dao: MockedDAOClient

    async start(): Promise<void> {
        this.postgresContainer = await new GenericContainer('postgres')
            .withName('postgres_test')
            .withEnv('POSTGRES_PASSWORD', DEFAULT_DATABASE_CONFIG.password)
            .withEnv('POSTGRES_USER', DEFAULT_DATABASE_CONFIG.user)
            .withExposedPorts(E2ETestEnvironment.POSTGRES_PORT)
            .start();

        const mappedPort = this.postgresContainer.getMappedPort(E2ETestEnvironment.POSTGRES_PORT)
        this.sharedEnv = new Environment()
            .setConfig(EnvironmentConfig.PSQL_PASSWORD, DEFAULT_DATABASE_CONFIG.password)
            .setConfig(EnvironmentConfig.PSQL_USER, DEFAULT_DATABASE_CONFIG.user)
            .setConfig(EnvironmentConfig.PSQL_PORT, mappedPort)
            .setConfig(EnvironmentConfig.PSQL_SCHEMA, E2ETestEnvironment.TEST_SCHEMA)
            .setConfig(EnvironmentConfig.PSQL_HOST, this.postgresContainer.getContainerIpAddress())
            .setConfig(EnvironmentConfig.METRICS, false)
            .setConfig(EnvironmentConfig.LOG_REQUESTS, false)
            .setConfig(EnvironmentConfig.LOG_LEVEL, "debug")
            .setConfig(EnvironmentConfig.ALLOW_DEPLOYMENTS_FOR_TESTING, true)
            .setConfig(EnvironmentConfig.PERFORM_MULTI_SERVER_ONBOARDING, false)
            .registerBean(Bean.DEPLOYMENT_REPORTER, new NoOpDeploymentReporter())
            .registerBean(Bean.ACCESS_CHECKER, new MockedAccessChecker())
        this.repository = await RepositoryFactory.create(this.sharedEnv)
    }

    async stop(): Promise<void> {
        await this.postgresContainer.stop()
    }

    async clearDatabases(): Promise<void> {
        await this.repository.query(`DROP SCHEMA ${E2ETestEnvironment.TEST_SCHEMA} CASCADE`)
    }

    async stopServers(): Promise<void> {
        if (this.runningServers) {
            await Promise.all(this.runningServers.map(server => server.stop()))
        }
    }

    resetDAOAndServers() {
        this.dao = MockedDAOClient.withAddresses()
        this.runningServers = []
    }

    configServer(syncInternal?: number| string): ServerBuilder {
        const asTestEnvCall = {
            addToDAO: (address: string) => this.dao.add(address),
            createDatabases: (amount: number) => this.createDatabases(amount),
            registerServers: (servers: TestServer[]) => this.registerServers(servers),
        }
        const builder = new ServerBuilder(asTestEnvCall, this.sharedEnv)
            .withBean(Bean.DAO_CLIENT, this.dao)
        if (syncInternal) {
            const interval = typeof syncInternal === 'number' ? syncInternal : ms(syncInternal)
            builder
                .withConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, interval)
                .withConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, interval)
        }
        return builder
    }

    async getEnvForNewDatabase(): Promise<Environment> {
        const [ dbName ] = await this.createDatabases(1)
        return new Environment(this.sharedEnv)
            .setConfig(EnvironmentConfig.PSQL_DATABASE, dbName)
    }

    removeFromDAO(address: ServerAddress) {
        this.dao.remove(address)
    }

    buildMany(amount: number): Promise<TestServer[]> {
        return this.configServer().andBuildMany(amount)
    }

    private registerServers(servers: TestServer[]) {
        this.runningServers.push(...servers)
    }

    private async createDatabases(amount: number) {
        await this.repository.none(`CREATE SCHEMA IF NOT EXISTS ${E2ETestEnvironment.TEST_SCHEMA}`)
        const dbNames = new Array(amount).fill(0).map((_) => 'db' + random.alphaNumeric(8))
        for (const dbName of dbNames) {
            await this.repository.none(`CREATE DATABASE ${dbName}`)
        }
        return dbNames
    }

}

type TestEnvCalls = {
    addToDAO: (address: string) => void,
    createDatabases: (amount: number) => Promise<string[]>,
    registerServers: (servers: TestServer[]) => void,
}

export class ServerBuilder {

    private readonly sharedBuilder: EnvironmentBuilder

    constructor(private readonly testEnvCalls: TestEnvCalls, env: Environment) {
        this.sharedBuilder = new EnvironmentBuilder(env)
    }

    withBean(bean: Bean, value: any): ServerBuilder {
        this.sharedBuilder.withBean(bean, value)
        return this
    }

    withConfig(config: EnvironmentConfig, value: any): ServerBuilder {
        this.sharedBuilder.withConfig(config, value)
        return this
    }

    async andBuild(): Promise<TestServer> {
        const [ server ] = await this.andBuildMany(1)
        return server
    }

    async andBuildMany(amount: number): Promise<TestServer[]> {
        const ports = new Array(amount).fill(0).map((_, idx) => idx * 1010 + 6060)
        return this.andBuildOnPorts(ports)
    }

    async andBuildOnPorts(ports: number[]): Promise<TestServer[]> {
        const databaseNames = await this.testEnvCalls.createDatabases(ports.length)

        const servers: TestServer[] = []
        for (let i = 0; i < ports.length; i++) {
            const serverEnvBuilder = new EnvironmentBuilder(this.sharedBuilder)
            const port = ports[i]
            const address = `http://localhost:${port}`
            this.testEnvCalls.addToDAO(address)
            serverEnvBuilder
                .withConfig(EnvironmentConfig.NAME_PREFIX, `Server${i + 1}_`)
                .withConfig(EnvironmentConfig.SERVER_PORT, port)
                .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, `storage_${port}`)
                .withConfig(EnvironmentConfig.PSQL_DATABASE, databaseNames[i])
            const env = await serverEnvBuilder.build()
            servers[i] = new TestServer(env)
        }

        this.testEnvCalls.registerServers(servers)

        return servers
    }

}

/**
 * This is an easy way to load a test environment into a test suite
 */
export function loadTestEnvironment(): E2ETestEnvironment {

    const testEnv = new E2ETestEnvironment()

    beforeAll(async () => {
        await testEnv.start()
    });

    afterAll(async () => {
        await testEnv.stop()
    });

    beforeEach(() => {
        testEnv.resetDAOAndServers()
    })

    afterEach(async () => {
        await testEnv.stopServers()
        await testEnv.clearDatabases()
    })

    return testEnv

}