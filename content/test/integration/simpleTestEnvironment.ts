import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { DEFAULT_DATABASE_CONFIG, Environment, EnvironmentBuilder, EnvironmentConfig } from '../../src/Environment'
import { stopAllComponents } from '../../src/logic/components-lifecycle'
import { metricsDeclaration } from '../../src/metrics'
import { createMigrationExecutor } from '../../src/migrations/migration-executor'
import { createDatabaseComponent } from '../../src/ports/postgres'
import { MockedDAOClient } from '../helpers/service/synchronization/clients/MockedDAOClient'
import { random } from 'faker'
import { TestProgram } from './TestProgram'

const TEST_SCHEMA = 'e2etest'
const POSTGRES_PORT = 5432

export type SimpleTestEnvironment = {
  start(): Promise<TestProgram>
  clearDatabase(): Promise<void>
  stop(): Promise<void>
}

export async function createDefaultDB() {
  const dbName = 'db' + random.alphaNumeric(8)
  process.env.__TEST_DB_NAME = dbName
  const logs = await createLogComponent({
    config: createConfigComponent({
      LOG_LEVEL: 'WARN'
    })
  })
  const sharedEnv = new Environment()
    .setConfig(EnvironmentConfig.PSQL_PASSWORD, DEFAULT_DATABASE_CONFIG.password)
    .setConfig(EnvironmentConfig.PSQL_USER, DEFAULT_DATABASE_CONFIG.user)
    .setConfig(
      EnvironmentConfig.PSQL_PORT,
      process.env.MAPPED_POSTGRES_PORT ? parseInt(process.env.MAPPED_POSTGRES_PORT) : POSTGRES_PORT
    )
    .setConfig(EnvironmentConfig.PSQL_SCHEMA, TEST_SCHEMA)
    .setConfig(EnvironmentConfig.PSQL_HOST, 'localhost')
    .setConfig(EnvironmentConfig.LOG_REQUESTS, false)
    .setConfig(EnvironmentConfig.LOG_LEVEL, 'WARN')
    .setConfig(EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH, false)
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const database = await createDatabaseComponent({ logs, env: sharedEnv, metrics })
  if (database.start) {
    await database.start()
  }

  await database.query(`CREATE DATABASE ${dbName}`)
  await database.query(`
      CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}
    `)

  const env = new Environment(sharedEnv).setConfig(EnvironmentConfig.PSQL_DATABASE, dbName)
  const migrationManager = createMigrationExecutor({ logs, env })
  await migrationManager.run()
  await stopAllComponents({ migrationManager, database })
}

let dbCreated = false
export async function createSimpleTestEnvironment(): Promise<SimpleTestEnvironment> {
  let server: TestProgram | undefined = undefined

  if (!dbCreated) {
    await createDefaultDB()
    dbCreated = true
  }

  const dao = MockedDAOClient.withAddresses()
  const logs = await createLogComponent({
    config: createConfigComponent({
      LOG_LEVEL: 'WARN'
    })
  })
  const sharedEnv = new Environment()
    .setConfig(EnvironmentConfig.PSQL_PASSWORD, DEFAULT_DATABASE_CONFIG.password)
    .setConfig(EnvironmentConfig.PSQL_USER, DEFAULT_DATABASE_CONFIG.user)
    .setConfig(
      EnvironmentConfig.PSQL_PORT,
      process.env.MAPPED_POSTGRES_PORT ? parseInt(process.env.MAPPED_POSTGRES_PORT) : POSTGRES_PORT
    )
    .setConfig(EnvironmentConfig.PSQL_SCHEMA, TEST_SCHEMA)
    .setConfig(EnvironmentConfig.PSQL_HOST, 'localhost')
    .setConfig(EnvironmentConfig.LOG_REQUESTS, false)
    .setConfig(EnvironmentConfig.LOG_LEVEL, 'WARN')
    .setConfig(EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH, false)
    .setConfig(EnvironmentConfig.PSQL_DATABASE, process.env.__TEST_DB_NAME)

  const port = 1200
  const storageBaseFolder = sharedEnv.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER) ?? 'storage'

  const builder = new EnvironmentBuilder(sharedEnv).withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
  const components = await builder
    .withConfig(EnvironmentConfig.HTTP_SERVER_PORT, port)
    .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, `${storageBaseFolder}/${port}`)
    .buildConfigAndComponents()

  const domain = `http://localhost:${port}`

  async function start(): Promise<TestProgram> {
    dao.add(domain)
    server = new TestProgram(components)
    await server.startProgram()
    return server
  }

  async function stop(): Promise<void> {
    if (server) {
      server.stopProgram()
    }

    await stopAllComponents({ logs })
  }

  async function clearDatabase(): Promise<void> {
    if (server) {
      await components.database.query('TRUNCATE TABLE deployments, content_files, active_pointers CASCADE')
    }
  }

  return {
    start,
    clearDatabase,
    stop
  }
}
