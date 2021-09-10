import { Environment, EnvironmentConfig } from '../Environment'
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

    const database = await build(connection, contentCredentials)
    return new Repository(
      database,
      new RepositoryQueue({
        maxConcurrency: env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_MAX_CONCURRENCY),
        maxQueued: env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_MAX_QUEUED),
        timeout: env.getConfig(EnvironmentConfig.REPOSITORY_QUEUE_TIMEOUT)
      })
    )
  }
}
