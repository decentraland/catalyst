import log4js from 'log4js'
import ms from 'ms'
import pgPromise, { IDatabase, IInitOptions, IMain, ITask } from 'pg-promise'
import { retry } from '../helpers/RetryHelper'
import { ContentFilesRepository } from './repositories/ContentFilesRepository'
import { DenylistRepository } from './repositories/DenylistRepository'
import { DeploymentPointerChangesRepository } from './repositories/DeploymentPointerChangesRepository'
import { DeploymentsRepository } from './repositories/DeploymentsRepository'
import { FailedDeploymentsRepository } from './repositories/FailedDeploymentsRepository'
import { LastDeployedPointersRepository } from './repositories/LastDeployedPointersRepository'
import { MigrationDataRepository } from './repositories/MigrationDataRepository'
import { PointerHistoryRepository } from './repositories/PointerHistoryRepository'
import { SystemPropertiesRepository } from './repositories/SystemPropertiesRepository'

const LOGGER = log4js.getLogger('Repository')

export type Repository = IDatabase<IExtensions> & IExtensions
export type RepositoryTask = ITask<IExtensions> & IExtensions

export interface IExtensions {
  deployments: DeploymentsRepository
  migrationData: MigrationDataRepository
  content: ContentFilesRepository
  pointerHistory: PointerHistoryRepository
  lastDeployedPointers: LastDeployedPointersRepository
  failedDeployments: FailedDeploymentsRepository
  deploymentPointerChanges: DeploymentPointerChangesRepository
  denylist: DenylistRepository
  systemProperties: SystemPropertiesRepository
}

export type DBConnection = {
  host: string
  port: number
}

export type DBCredentials = {
  database: string
  user: string
  password: string
}

/**
 * Builds the repository by connection to the content database. If it isn't present, then it tries to connect with the root user and creates the content database and user.
 */
export async function build(
  connection: DBConnection,
  contentCredentials: DBCredentials,
  rootCredentials?: DBCredentials
): Promise<Repository> {
  try {
    return await connectTo(connection, contentCredentials)
  } catch (error) {
    if (rootCredentials) {
      console.log('Trying to create database...')
      // Probably the content database doesn't exist. So we try to create it
      const rootRepo = await connectTo(connection, rootCredentials)
      await rootRepo.query(`CREATE USER ${contentCredentials.user} WITH PASSWORD $1`, [contentCredentials.password])
      await rootRepo.query(`CREATE DATABASE ${contentCredentials.database}`)
      await rootRepo.query(
        `GRANT ALL PRIVILEGES ON DATABASE ${contentCredentials.database} TO ${contentCredentials.user}`
      )

      return connectTo(connection, contentCredentials)
    } else {
      throw error
    }
  }
}

async function connectTo(connection: DBConnection, credentials: DBCredentials) {
  const initOptions: IInitOptions<IExtensions> = {
    extend(obj: Repository, dc: any) {
      obj.deployments = new DeploymentsRepository(obj)
      obj.migrationData = new MigrationDataRepository(obj)
      obj.content = new ContentFilesRepository(obj)
      obj.pointerHistory = new PointerHistoryRepository(obj)
      obj.lastDeployedPointers = new LastDeployedPointersRepository(obj)
      obj.deploymentPointerChanges = new DeploymentPointerChangesRepository(obj)
      obj.failedDeployments = new FailedDeploymentsRepository(obj)
      obj.denylist = new DenylistRepository(obj)
      obj.systemProperties = new SystemPropertiesRepository(obj)
    },

    error(err, e) {
      console.log(`Failed to connect to the database. Error was ${err}`)
      if (e.query) {
        console.log(`Query was ${e.query}`)
      }
    }
  }

  const pgp: IMain = pgPromise(initOptions)

  const dbConfig = {
    ...connection,
    ...credentials,
    max: 20
  }

  // Build the database
  const db: Repository = pgp(dbConfig)

  setInterval(() => LOGGER.debug('Amount of queries waiting: ', db.$pool.waitingCount), ms('1m'))

  // Make sure we can connect to it
  await retry(
    async () => {
      const connection = await db.connect()
      connection.done(true)
    },
    6,
    'connect to the database',
    '10s'
  )

  return db
}
