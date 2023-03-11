import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { random } from 'faker'
import ms from 'ms'
import { DEFAULT_DATABASE_CONFIG, Environment, EnvironmentBuilder, EnvironmentConfig } from '../../src/Environment'
import { stopAllComponents } from '../../src/logic/components-lifecycle'
import { metricsDeclaration } from '../../src/metrics'
import { MigrationManagerFactory } from '../../src/migrations/MigrationManagerFactory'
import { createDatabaseComponent, IDatabaseComponent } from '../../src/ports/postgres'
import { DaoComponent } from '../../src/service/synchronization/clients/HardcodedDAOClient'
import { AppComponents } from '../../src/types'
import { MockedDAOClient } from '../helpers/service/synchronization/clients/MockedDAOClient'
import { TestProgram } from './TestProgram'
import LeakDetector from 'jest-leak-detector'

export class E2ETestEnvironment {
  public static TEST_SCHEMA = 'e2etest'
  public static POSTGRES_PORT = 5432
  private runningServers: TestProgram[]
  private database: IDatabaseComponent
  private sharedEnv: Environment
  private dao: MockedDAOClient
  private logs: ILoggerComponent

  async start(overrideConfigs?: Record<number, any>): Promise<void> {
    const port = process.env.MAPPED_POSTGRES_PORT
      ? parseInt(process.env.MAPPED_POSTGRES_PORT)
      : E2ETestEnvironment.POSTGRES_PORT
    this.sharedEnv = new Environment()
      .setConfig(EnvironmentConfig.PSQL_PASSWORD, DEFAULT_DATABASE_CONFIG.password)
      .setConfig(EnvironmentConfig.PSQL_USER, DEFAULT_DATABASE_CONFIG.user)
      .setConfig(EnvironmentConfig.PSQL_PORT, port)
      .setConfig(EnvironmentConfig.PSQL_SCHEMA, E2ETestEnvironment.TEST_SCHEMA)
      .setConfig(EnvironmentConfig.PSQL_HOST, 'localhost')
      .setConfig(EnvironmentConfig.LOG_REQUESTS, false)
      .setConfig(EnvironmentConfig.LOG_LEVEL, 'WARN')
      .setConfig(EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH, false)

    if (overrideConfigs) {
      for (const key in overrideConfigs) {
        const value = overrideConfigs[key]
        console.debug('Override for Environment Config: ', (<any>EnvironmentConfig)[key], value)
        this.sharedEnv.setConfig(parseInt(key) as EnvironmentConfig, value)
      }
    }
    const metrics = createTestMetricsComponent(metricsDeclaration)
    this.logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'WARN'
      })
    })
    this.database = await createDatabaseComponent({ logs: this.logs, env: this.sharedEnv, metrics })
    if (this.database.start) this.database.start()
  }

  async stop(): Promise<void> {
    // first kill the servers
    await this.stopAllComponentsFromAllServersAndDeref()

    // then the components of the environment
    await stopAllComponents({
      database: this.database
    })
  }

  async clearDatabases(): Promise<void> {
    await this.database.query(`
      DROP SCHEMA IF EXISTS ${E2ETestEnvironment.TEST_SCHEMA} CASCADE
    `)
  }

  async stopAllComponentsFromAllServersAndDeref(): Promise<void> {
    if (this.runningServers) {
      await Promise.all(this.runningServers.map((server) => server.stopProgram()))
      this.runningServers = []
    }
  }

  resetDAOAndServers() {
    this.dao = MockedDAOClient.withAddresses()
    this.runningServers = []
  }

  configServer(syncInternal?: number | string): ServerBuilder {
    const asTestEnvCall: TestEnvCalls = {
      addToDAO: (domain: string) => this.dao.add(domain),
      createDatabases: (amount: number) => this.createDatabases(amount),
      registerServer: (server: TestProgram) => this.runningServers.push(server)
    }

    const builder = new ServerBuilder(asTestEnvCall, this.sharedEnv, this.dao)

    if (syncInternal) {
      const interval = typeof syncInternal === 'number' ? syncInternal : ms(syncInternal)
      builder.withConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, interval)
    }
    return builder
  }

  /** Returns the environment, with the migrations run */
  async getEnvForNewDatabase(): Promise<Environment> {
    const [dbName] = await this.createDatabases(1)
    const env = new Environment(this.sharedEnv).setConfig(EnvironmentConfig.PSQL_DATABASE, dbName)
    const migrationManager = MigrationManagerFactory.create({ logs: this.logs, env })
    await migrationManager.run()
    await stopAllComponents({ migrationManager })
    return env
  }

  /** Returns a service that connects to the database, with the migrations run */
  async buildService(): Promise<AppComponents> {
    const baseEnv = await this.getEnvForNewDatabase()
    const components = await new EnvironmentBuilder(baseEnv).buildConfigAndComponents()
    return components
  }

  removeFromDAO(domain: string) {
    this.dao.remove(domain)
  }

  buildMany(amount: number): Promise<TestProgram[]> {
    return this.configServer().andBuildMany(amount)
  }

  private async createDatabases(amount: number) {
    await this.database.query(`
      CREATE SCHEMA IF NOT EXISTS ${E2ETestEnvironment.TEST_SCHEMA}
    `)
    const dbNames = new Array(amount).fill(0).map((_) => 'db' + random.alphaNumeric(8))
    for (const dbName of dbNames) {
      await this.database.query(`CREATE DATABASE ${dbName}`)
    }
    return dbNames
  }
}

type TestEnvCalls = {
  addToDAO: (domain: string) => void
  createDatabases: (amount: number) => Promise<string[]>
  registerServer: (servers: TestProgram) => void
}

export class ServerBuilder {
  private readonly builder: EnvironmentBuilder
  private readonly storageBaseFolder: string

  constructor(private readonly testEnvCalls: TestEnvCalls, env: Environment, public dao: DaoComponent) {
    this.builder = new EnvironmentBuilder(env)
    this.storageBaseFolder = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER) ?? 'storage'
  }

  withConfig(config: EnvironmentConfig, value: any): ServerBuilder {
    this.builder.withConfig(config, value)
    return this
  }

  async andBuild(): Promise<TestProgram> {
    const [server] = await this.andBuildMany(1)
    return server
  }

  async andBuildMany(amount: number): Promise<TestProgram[]> {
    const ports = new Array(amount).fill(0).map((_, idx) => idx * 1010 + 6060)
    return this.andBuildOnPorts(ports)
  }

  async andBuildOnPorts(ports: number[]): Promise<TestProgram[]> {
    const databaseNames = await this.testEnvCalls.createDatabases(ports.length)

    const servers: TestProgram[] = []
    for (let i = 0; i < ports.length; i++) {
      const port = ports[i]
      const domain = `http://localhost:${port}`
      this.testEnvCalls.addToDAO(domain)
      const components = await this.builder
        .withConfig(EnvironmentConfig.SERVER_PORT, port)
        .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, `${this.storageBaseFolder}/${port}`)
        .withConfig(EnvironmentConfig.PSQL_DATABASE, databaseNames[i])
        .buildConfigAndComponents()

      if (this.dao) {
        // mock DAO client
        jest
          .spyOn(components.daoClient, 'getAllContentServers')
          .mockImplementation(() => this.dao.getAllContentServers())
        jest.spyOn(components.daoClient, 'getAllServers').mockImplementation(() => this.dao.getAllServers())
      }

      servers[i] = new TestProgram(components)
      this.testEnvCalls.registerServer(servers[i])
    }

    return servers
  }
}

export function setupTestEnvironment(overrideConfigs?: Record<number, any>) {
  let testEnv = new E2ETestEnvironment()

  beforeAll(async () => {
    await testEnv.start(overrideConfigs)
  })

  beforeEach(() => {
    testEnv.resetDAOAndServers()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await testEnv.clearDatabases()
    await testEnv.stopAllComponentsFromAllServersAndDeref()
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(testEnv)
    await testEnv.stop()
    testEnv = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  return () => testEnv
}
/**
 * This is an easy way to load a test environment into a test suite
 */
export function loadTestEnvironment(
  overrideConfigs?: Record<number, any>
): (name: string, test: (testEnv: E2ETestEnvironment) => void) => void {
  return function (name, test) {
    describe(name, () => {
      const testEnv = new E2ETestEnvironment()

      beforeAll(async () => {
        await testEnv.start(overrideConfigs)
      })

      describe('use cases for test environment', () => {
        beforeEach(() => {
          testEnv.resetDAOAndServers()
        })

        afterEach(async () => {
          await testEnv.clearDatabases()
          await testEnv.stopAllComponentsFromAllServersAndDeref()
        })

        test(testEnv)
      })

      afterAll(async () => {
        await testEnv.stop()
      })
    })
  }
}

/**
 * Builds a complete server and returns its components.
 * It does not start the components.
 */
export function testCaseWithComponents(
  getTestEnv: () => E2ETestEnvironment,
  name: string,
  fn: (components: AppComponents) => Promise<void>
) {
  it(name, async () => {
    const components = await getTestEnv().buildService()
    try {
      await fn(components)
    } finally {
      await stopAllComponents(components)
    }
  })
}
