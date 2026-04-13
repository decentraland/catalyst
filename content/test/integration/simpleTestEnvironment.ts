import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@dcl/metrics'
import { DEFAULT_DATABASE_CONFIG, Environment, EnvironmentBuilder, EnvironmentConfig } from '../../src/Environment'
import { stopAllComponents } from '../../src/logic/components-lifecycle'
import { metricsDeclaration } from '../../src/metrics'
import { createPgComponent } from '@dcl/pg-component'
import { join } from 'path'
import { MockedDAOClient } from '../helpers/service/synchronization/clients/MockedDAOClient'
import { random } from 'faker'
import { createNoOpDeployRateLimiter } from '../mocks/deploy-rate-limiter-mock'
import { TestProgram } from './TestProgram'

const TEST_SCHEMA = 'e2etest'
const POSTGRES_PORT = 5432

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
  const pgConfig = createConfigComponent({
    PG_COMPONENT_PSQL_HOST: sharedEnv.getConfig<string>(EnvironmentConfig.PSQL_HOST) ?? 'localhost',
    PG_COMPONENT_PSQL_PORT: String(sharedEnv.getConfig<number>(EnvironmentConfig.PSQL_PORT) ?? 5432),
    PG_COMPONENT_PSQL_DATABASE: sharedEnv.getConfig<string>(EnvironmentConfig.PSQL_DATABASE) ?? 'content',
    PG_COMPONENT_PSQL_USER: sharedEnv.getConfig<string>(EnvironmentConfig.PSQL_USER) ?? 'postgres',
    PG_COMPONENT_PSQL_PASSWORD: sharedEnv.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD) ?? ''
  })
  const database = await createPgComponent({ config: pgConfig, logs, metrics })
  await database.start()

  await database.query(`CREATE DATABASE ${dbName}`)
  await database.query(`
      CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}
    `)

  const env = new Environment(sharedEnv).setConfig(EnvironmentConfig.PSQL_DATABASE, dbName)
  const migPgConfig = createConfigComponent({
    PG_COMPONENT_PSQL_HOST: env.getConfig<string>(EnvironmentConfig.PSQL_HOST) ?? 'localhost',
    PG_COMPONENT_PSQL_PORT: String(env.getConfig<number>(EnvironmentConfig.PSQL_PORT) ?? 5432),
    PG_COMPONENT_PSQL_DATABASE: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE) ?? 'content',
    PG_COMPONENT_PSQL_USER: env.getConfig<string>(EnvironmentConfig.PSQL_USER) ?? 'postgres',
    PG_COMPONENT_PSQL_PASSWORD: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD) ?? ''
  })
  const migDb = await createPgComponent({ config: migPgConfig, logs }, {
    migration: {
      migrationsTable: 'migrations',
      dir: join(__dirname, '../../src/migrations/scripts'),
      direction: 'up' as const,
      count: Infinity,
      ignorePattern: '.*\\.map',
      createSchema: true,
      createMigrationsSchema: true
    }
  })
  await migDb.start()
  await stopAllComponents({ database, migDb })
  return dbName
}

export async function clearDatabase(server: TestProgram): Promise<void> {
  await server.components.database.query(
    'TRUNCATE TABLE deployments, content_files, active_pointers, processed_snapshots, failed_deployments CASCADE'
  )
  // Refresh materialized view to reflect truncated data
  await server.components.database.query(
    'REFRESH MATERIALIZED VIEW CONCURRENTLY active_third_party_collection_items_deployments_with_content'
  )
}

export function resetServer(server: TestProgram): Promise<void> {
  server.components.activeEntities.reset()
  server.components.processedSnapshotStorage.reset()
  return clearDatabase(server)
}

async function createServer(
  dao: MockedDAOClient,
  dbName: string,
  serverPort: number,
  overrideConfigs?: Record<number, any>
): Promise<TestProgram> {
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
    .setConfig(EnvironmentConfig.PSQL_DATABASE, dbName)

  if (overrideConfigs) {
    for (const key in overrideConfigs) {
      const value = overrideConfigs[key]
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

  const domain = `http://127.0.0.1:${serverPort}`
  dao.add(domain)
  const server = new TestProgram(components)
  server.components.daoClient = dao
  // Override methods on the existing rate limiter object (not replace it)
  // because the deployer captures its own reference to the original object
  const noOp = createNoOpDeployRateLimiter()
  Object.assign(server.components.deployRateLimiter, noOp)
  await server.startProgram()
  return server
}

let dbCreated = false
export async function createDefaultServer(overrideConfigs?: Record<number, any>): Promise<TestProgram> {
  if (!dbCreated) {
    process.env.__TEST_DB_NAME = await createDB()
    dbCreated = true
  }

  const dao = MockedDAOClient.withAddresses()
  return createServer(dao, process.env.__TEST_DB_NAME!, 1200, overrideConfigs)
}

export async function createAdditionalServer(
  defaultServer: TestProgram,
  port: number,
  overrideConfigs?: Record<number, any>
): Promise<TestProgram> {
  const dbName = await createDB()

  return createServer(defaultServer.components.daoClient as any, dbName, port, overrideConfigs)
}
