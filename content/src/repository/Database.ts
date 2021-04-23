import log4js from 'log4js'
import pgPromise, { IBaseProtocol, IDatabase, IInitOptions, IMain } from 'pg-promise'
import { retry } from '../helpers/RetryHelper'
import { ContentFilesRepository } from './extensions/ContentFilesRepository'
import { DenylistRepository } from './extensions/DenylistRepository'
import { DeploymentPointerChangesRepository } from './extensions/DeploymentPointerChangesRepository'
import { DeploymentsRepository } from './extensions/DeploymentsRepository'
import { FailedDeploymentsRepository } from './extensions/FailedDeploymentsRepository'
import { LastDeployedPointersRepository } from './extensions/LastDeployedPointersRepository'
import { MigrationDataRepository } from './extensions/MigrationDataRepository'
import { PointerHistoryRepository } from './extensions/PointerHistoryRepository'
import { SystemPropertiesRepository } from './extensions/SystemPropertiesRepository'

export type Database = IBaseProtocol<IExtensions> & IExtensions
export type FullDatabase = IDatabase<IExtensions> & Database

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

type DBConnection = {
  host: string
  port: number
}

type DBCredentials = {
  database: string
  user: string
  password: string
}

const LOGGER = log4js.getLogger('Database')

/**
 * Builds the database client by connecting to the content database
 */
export function build(connection: DBConnection, contentCredentials: DBCredentials): Promise<FullDatabase> {
  return connectTo(connection, contentCredentials)
}

async function connectTo(connection: DBConnection, credentials: DBCredentials) {
  const initOptions: IInitOptions<IExtensions> = {
    extend(obj: Database, dc: any) {
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
    },

    query(e) {
      LOGGER.trace(e.query)
    }
  }

  const pgp: IMain = pgPromise(initOptions)

  const dbConfig = {
    ...connection,
    ...credentials,
    max: 20
  }

  // Build the database
  const db: FullDatabase = pgp(dbConfig)

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
