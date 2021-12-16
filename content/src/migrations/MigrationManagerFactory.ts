import { Environment, EnvironmentConfig } from '../Environment'
import { MigrationManager } from './MigrationManager'

export class MigrationManagerFactory {
  static create(env: Environment): MigrationManager {
    const databaseConfig = {
      user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
      password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
      database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
      host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
      port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
      idleTimeoutMillis: env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
      query_timeout: env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT)
    }

    return new MigrationManager(databaseConfig)
  }
}
