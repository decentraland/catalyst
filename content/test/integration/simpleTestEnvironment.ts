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
const serverPort = 1200

export async function createDB() {
  const dbName = 'db' + random.alphaNumeric(8)
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
  return dbName
}

export async function clearDatabase(server: TestProgram): Promise<void> {
  await server.components.database.query(
    'TRUNCATE TABLE deployments, content_files, active_pointers, processed_snapshots CASCADE'
  )
}

export function resetServer(server: TestProgram): Promise<void> {
  server.components.activeEntities.reset()
  return clearDatabase(server)
}

let dbCreated = false
export async function createDefaultServer(overrideConfigs?: Record<number, any>): Promise<TestProgram> {
  if (!dbCreated) {
    process.env.__TEST_DB_NAME = await createDB()
    dbCreated = true
  }

  const dao = MockedDAOClient.withAddresses()
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

  if (overrideConfigs) {
    for (const key in overrideConfigs) {
      const value = overrideConfigs[key]
      console.debug('Override for Environment Config: ', (<any>EnvironmentConfig)[key], value)
      sharedEnv.setConfig(parseInt(key) as EnvironmentConfig, value)
    }
  } else {
    sharedEnv.setConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
  }

  const storageBaseFolder = sharedEnv.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER) ?? 'storage'

  const components = await new EnvironmentBuilder(sharedEnv)
    .withConfig(EnvironmentConfig.HTTP_SERVER_PORT, serverPort)
    .withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, `${storageBaseFolder}/${serverPort}`)
    .buildConfigAndComponents()

  const domain = `http://localhost:${serverPort}`
  dao.add(domain)
  const server = new TestProgram(components)
  server.components.daoClient = dao
  await server.startProgram()
  return server
}
