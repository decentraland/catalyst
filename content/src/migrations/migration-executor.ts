import runner from 'node-pg-migrate'
import { MigrationDirection, RunnerOption } from 'node-pg-migrate/dist/types'
import { join } from 'path'
import { PoolConfig } from 'pg'
import { EnvironmentConfig } from '../Environment.js'
import { AppComponents } from '../types.js'

export interface MigrationExecutor {
  run: () => Promise<void>
}

function shouldLog(): boolean {
  return process.env.CI !== 'true' && process.env.RUNNING_TESTS !== 'true'
}

export function createMigrationExecutor(components: Pick<AppComponents, 'logs' | 'env'>): MigrationExecutor {
  const { env, logs } = components
  const logger = logs.getLogger('migration-manager')

  const databaseConfig: PoolConfig = {
    user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
    password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
    database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
    host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
    port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
    idleTimeoutMillis: env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
    query_timeout: env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT)
  }

  const dbRunnerOptions: RunnerOption = {
    migrationsTable: 'migrations',
    dir: join(__dirname, 'scripts'),
    direction: 'up' as MigrationDirection,
    createSchema: true,
    createMigrationsSchema: true,
    count: Infinity,
    databaseUrl: databaseConfig,
    log: shouldLog() ? logger.log : () => {},
    logger: shouldLog() ? logger : undefined,
    ignorePattern: '..*map'
  }

  async function run(): Promise<void> {
    logger.debug('Running migrations')
    await runner(dbRunnerOptions)
  }

  return {
    run
  }
}
