import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'
import { MigrationManager } from './MigrationManager'

export class MigrationManagerFactory {
  static create(components: Pick<AppComponents, 'logs' | 'env'>): MigrationManager {
    const { env } = components

    const databaseConfig = {
      user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
      password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
      database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
      host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
      port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
      idleTimeoutMillis: env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
      query_timeout: env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT)
    }

    return new MigrationManager(components, databaseConfig)
  }
}
