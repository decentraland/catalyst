import { Environment, EnvironmentConfig } from '../Environment'
import { build, DBCredentials } from './Database'
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

    let rootCredentials: DBCredentials | undefined

    if (process.env.POSTGRES_PASSWORD && process.env.POSTGRES_USER && process.env.POSTGRES_DB) {
      rootCredentials = {
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD
      }
    }

    const database = await build(connection, contentCredentials, rootCredentials)
    return new Repository(
      database,
      new RepositoryQueue({
        maxConcurrency: env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_MAX_CONCURRENCY),
        maxQueued: env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_MAX_QUEUED)
      })
    )
  }
}
