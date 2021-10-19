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

/**
 * Builds the database client by connecting to the content database
 */
export function build(
  connection: DBConnection,
  contentCredentials: DBCredentials,
  idleTimeoutMillis: number,
  query_timeout: number
): Promise<FullDatabase> {
  return connectTo(connection, contentCredentials, idleTimeoutMillis, query_timeout)
}

async function connectTo(
  connection: DBConnection,
  credentials: DBCredentials,
  idleTimeoutMillis: number,
  query_timeout: number
) {
  const initOptions: IInitOptions<IExtensions> = {
    extend(obj: Database) {
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
      console.debug(`Failed to connect to the database. Error was ${err}`)
      if (e.query) {
        console.debug(`Query was ${e.query}`)
      }
    }
  }

  const pgp: IMain = pgPromise(initOptions)

  const dbConfig = {
    ...connection,
    ...credentials,
    max: 20,
    idleTimeoutMillis: idleTimeoutMillis,
    query_timeout: query_timeout
  }

  // Build the database
  const db: FullDatabase = pgp(dbConfig)

  // Make sure we can connect to it
  await retry(
    async () => {
      const connection = await db.connect()
      return connection.done(true)
    },
    6,
    'connect to the database',
    '10s'
  )

  return db
}
