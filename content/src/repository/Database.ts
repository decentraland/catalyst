import pgPromise, { IBaseProtocol, IDatabase, IInitOptions, IMain } from 'pg-promise'
import { retry } from '../helpers/RetryHelper'
import { ContentFilesRepository } from './extensions/ContentFilesRepository'
import { DenylistRepository } from './extensions/DenylistRepository'
import { DeploymentPointerChangesRepository } from './extensions/DeploymentPointerChangesRepository'
import { DeploymentsRepository } from './extensions/DeploymentsRepository'
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
  type State = 'disconnected' | 'connecting' | 'connected' | 'retrying'
  let state = 'disconnected' as State
  const initOptions: IInitOptions<IExtensions> = {
    extend(obj: Database) {
      obj.deployments = new DeploymentsRepository(obj)
      obj.migrationData = new MigrationDataRepository(obj)
      obj.content = new ContentFilesRepository(obj)
      obj.pointerHistory = new PointerHistoryRepository(obj)
      obj.lastDeployedPointers = new LastDeployedPointersRepository(obj)
      obj.deploymentPointerChanges = new DeploymentPointerChangesRepository(obj)
      obj.denylist = new DenylistRepository(obj)
      obj.systemProperties = new SystemPropertiesRepository(obj)
    },

    error(err, e) {
      console.log(`🔥 Error in database connection with state ${state}:`)
      console.error(err)
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
      state = state === 'disconnected' ? 'connecting' : 'retrying'
      const connection = await db.connect()
      state = 'connected'
      return connection.done(true)
    },
    6,
    'connect to the database',
    '10s'
  )

  return db
}
