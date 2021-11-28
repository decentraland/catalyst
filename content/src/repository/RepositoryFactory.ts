import { createLogComponent } from '@well-known-components/logger'
import { Environment, EnvironmentConfig } from '../Environment'
import { createDatabaseComponent } from '../ports/postgres'
import { build } from './Database'
import { Repository } from './Repository'
import { RepositoryQueue } from './RepositoryQueue'

export class RepositoryFactory {
  static async create(env: Environment): Promise<Repository> {
    const connection = {
      port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
      host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST)
    }
    const contentCredentials = {
      database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
      user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
      password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD)
    }

    const database = await build(
      connection,
      contentCredentials,
      env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
      env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT)
    )
    const options = RepositoryFactory.parseQueueOptions(env)

    const databaseComponent = await createDatabaseComponent(
      { logs: createLogComponent() },
      {
        port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
        host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
        database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
        user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
        password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
        idleTimeoutMillis: env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
        query_timeout: env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT)
      }
    )

    return new Repository(database, new RepositoryQueue(options), databaseComponent)
  }

  private static parseQueueOptions(env: Environment) {
    let options = {}
    const maxConcurrency: string | undefined = env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_MAX_CONCURRENCY)
    if (!!maxConcurrency) {
      options = { maxConcurrency: +maxConcurrency }
    }
    const maxQueued: string | undefined = env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_MAX_QUEUED)
    if (!!maxQueued) {
      options = { ...options, maxQueued: +maxQueued }
    }
    const queueTimeout: string | undefined = env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_TIMEOUT)
    if (queueTimeout) {
      options = { ...options, queueTimeout: +queueTimeout }
    }
    return options
  }
}
