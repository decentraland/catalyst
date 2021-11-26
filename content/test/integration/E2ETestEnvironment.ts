import { ServerAddress } from 'dcl-catalyst-commons'
import { random } from 'faker'
import ms from 'ms'
import { GenericContainer, StartedTestContainer } from 'testcontainers'
import { Container } from 'testcontainers/dist/container'
import { LogWaitStrategy } from 'testcontainers/dist/wait-strategy'
import {
  Bean,
  DEFAULT_DATABASE_CONFIG,
  Environment,
  EnvironmentBuilder,
  EnvironmentConfig
} from '../../src/Environment'
import { MigrationManagerFactory } from '../../src/migrations/MigrationManagerFactory'
import { Repository } from '../../src/repository/Repository'
import { RepositoryFactory } from '../../src/repository/RepositoryFactory'
import { DB_REQUEST_PRIORITY } from '../../src/repository/RepositoryQueue'
import { MetaverseContentService } from '../../src/service/Service'
import { MockedAccessChecker } from '../helpers/service/access/MockedAccessChecker'
import { MockedDAOClient } from '../helpers/service/synchronization/clients/MockedDAOClient'
import { NoOpValidator } from '../helpers/service/validations/NoOpValidator'
import { isCI } from './E2ETestUtils'
import { TestServer } from './TestServer'

export class E2ETestEnvironment {
  private static TEST_SCHEMA = 'e2etest'
  private static POSTGRES_PORT = 5432
  private runningServers: TestServer[]
  private postgresContainer: StartedTestContainer
  private repository: Repository
  private sharedEnv: Environment
  private dao: MockedDAOClient

  async start(overrideConfigs?: Map<EnvironmentConfig, any>): Promise<void> {
    if (!isCI()) {
      this.postgresContainer = await new GenericContainer('postgres', '12')
        .withName('postgres_test')
        .withEnv('POSTGRES_PASSWORD', DEFAULT_DATABASE_CONFIG.password)
        .withEnv('POSTGRES_USER', DEFAULT_DATABASE_CONFIG.user)
        .withExposedPorts(E2ETestEnvironment.POSTGRES_PORT)
        .withWaitStrategy(new PostgresWaitStrategy())
        .start()
    }

    const mappedPort =
      this.postgresContainer?.getMappedPort(E2ETestEnvironment.POSTGRES_PORT) ?? E2ETestEnvironment.POSTGRES_PORT
    this.sharedEnv = new Environment()
      .setConfig(EnvironmentConfig.PSQL_PASSWORD, DEFAULT_DATABASE_CONFIG.password)
      .setConfig(EnvironmentConfig.PSQL_USER, DEFAULT_DATABASE_CONFIG.user)
      .setConfig(EnvironmentConfig.PSQL_PORT, mappedPort)
      .setConfig(EnvironmentConfig.PSQL_SCHEMA, E2ETestEnvironment.TEST_SCHEMA)
      .setConfig(EnvironmentConfig.PSQL_HOST, this.postgresContainer?.getContainerIpAddress() ?? 'localhost')
      .setConfig(EnvironmentConfig.LOG_REQUESTS, false)
      .setConfig(EnvironmentConfig.LOG_LEVEL, 'off')
      .setConfig(EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH, false)
      .setConfig(EnvironmentConfig.METRICS, false)
      .registerBean(Bean.ACCESS_CHECKER, new MockedAccessChecker())

    overrideConfigs?.forEach((value: any, key: EnvironmentConfig) => {
      console.debug('Override for Environment Config: ', (<any>EnvironmentConfig)[key], value)
      this.sharedEnv.setConfig(key, value)
    })

    this.repository = await RepositoryFactory.create(this.sharedEnv)
  }

  async stop(): Promise<void> {
    await this.repository.shutdown()
    await this.postgresContainer?.stop()
  }

  async clearDatabases(): Promise<void> {
    await this.repository.run((db) => db.query(`DROP SCHEMA IF EXISTS ${E2ETestEnvironment.TEST_SCHEMA} CASCADE`), {
      priority: DB_REQUEST_PRIORITY.HIGH
    })
  }

  async stopServers(): Promise<void> {
    if (this.runningServers) {
      await Promise.all(this.runningServers.map((server) => server.stop()))
    }
  }

  resetDAOAndServers() {
    this.dao = MockedDAOClient.withAddresses()
    this.runningServers = []
  }

  configServer(syncInternal?: number | string): ServerBuilder {
    const asTestEnvCall = {
      addToDAO: (address: string) => this.dao.add(address),
      createDatabases: (amount: number) => this.createDatabases(amount),
      registerServers: (servers: TestServer[]) => this.registerServers(servers)
    }
    const builder = new ServerBuilder(asTestEnvCall, this.sharedEnv).withBean(Bean.DAO_CLIENT, this.dao)
    if (syncInternal) {
      const interval = typeof syncInternal === 'number' ? syncInternal : ms(syncInternal)
      builder
        .withConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, interval)
        .withConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, interval)
    }
    return builder
  }

  /** Returns the environment, with the migrations run */
  async getEnvForNewDatabase(): Promise<Environment> {
    const [dbName] = await this.createDatabases(1)
    const env = new Environment(this.sharedEnv).setConfig(EnvironmentConfig.PSQL_DATABASE, dbName)
    const migrationManager = MigrationManagerFactory.create(env)
    await migrationManager.run()
    return env
  }

  /** Returns a service that connects to the database, with the migrations run */
  async buildService(): Promise<MetaverseContentService> {
    const baseEnv = await this.getEnvForNewDatabase()
    const env = await new EnvironmentBuilder(baseEnv).withBean(Bean.VALIDATOR, new NoOpValidator()).build()
    return env.getBean(Bean.SERVICE)
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
    await this.repository.run((db) => db.none(`CREATE SCHEMA IF NOT EXISTS ${E2ETestEnvironment.TEST_SCHEMA}`), {
      priority: DB_REQUEST_PRIORITY.HIGH
    })
    const dbNames = new Array(amount).fill(0).map((_) => 'db' + random.alphaNumeric(8))
    for (const dbName of dbNames) {
      await this.repository.run((db) => db.none(`CREATE DATABASE ${dbName}`), { priority: DB_REQUEST_PRIORITY.HIGH })
    }
    return dbNames
  }
}

type TestEnvCalls = {
  addToDAO: (address: string) => void
  createDatabases: (amount: number) => Promise<string[]>
  registerServers: (servers: TestServer[]) => void
}

export class ServerBuilder {
  private readonly builder: EnvironmentBuilder

  constructor(private readonly testEnvCalls: TestEnvCalls, env: Environment) {
    this.builder = new EnvironmentBuilder(env)
  }

  withBean(bean: Bean, value: any): ServerBuilder {
    this.builder.withBean(bean, value)
    return this
  }

  withConfig(config: EnvironmentConfig, value: any): ServerBuilder {
    this.builder.withConfig(config, value)
    return this
  }

  async andBuild(): Promise<TestServer> {
    const [server] = await this.andBuildMany(1)
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
      const port = ports[i]
      const address = `http://localhost:${port}`
      this.testEnvCalls.addToDAO(address)
      const env = await this.builder
        .withConfig(EnvironmentConfig.SERVER_PORT, port)
        .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, `storage_${port}`)
        .withConfig(EnvironmentConfig.PSQL_DATABASE, databaseNames[i])
        .build()
      servers[i] = new TestServer(env)
    }

    this.testEnvCalls.registerServers(servers)

    return servers
  }
}

/** During startup, the db is restarted, so we need to wait for the log message twice */
class PostgresWaitStrategy extends LogWaitStrategy {
  private static LOG = 'database system is ready to accept connections'
  constructor() {
    super(PostgresWaitStrategy.LOG)
  }

  public async waitUntilReady(container: Container): Promise<void> {
    let counter = 0
    return new Promise(async (resolve, reject) => {
      const stream = await container.logs()
      stream
        .on('data', (line) => {
          if (line.toString().includes(PostgresWaitStrategy.LOG)) {
            counter++
            if (counter === 2) {
              resolve()
            }
          }
        })
        .on('err', (line) => {
          if (line.toString().includes(PostgresWaitStrategy.LOG)) {
            counter++
            if (counter === 2) {
              resolve()
            }
          }
        })
        .on('end', () => {
          reject()
        })
    })
  }
}

export function loadStandaloneTestEnvironment(): E2ETestEnvironment {
  return loadTestEnvironment(new Map([[EnvironmentConfig.DISABLE_SYNCHRONIZATION, true]]))
}

/**
 * This is an easy way to load a test environment into a test suite
 */
export function loadTestEnvironment(overrideConfigs?: Map<EnvironmentConfig, any>): E2ETestEnvironment {
  const testEnv = new E2ETestEnvironment()

  beforeAll(async () => {
    await testEnv.start(overrideConfigs)
  })

  afterAll(async () => {
    await testEnv.stop()
  })

  beforeEach(() => {
    testEnv.resetDAOAndServers()
  })

  afterEach(async () => {
    await testEnv.clearDatabases()
    await testEnv.stopServers()
  })

  return testEnv
}
