import pgPromise, { IDatabase, ITask, IInitOptions, IMain } from 'pg-promise';
import { DeploymentsRepository } from './repositories/DeploymentsRepository';
import { MigrationDataRepository } from './repositories/MigrationDataRepository';
import { ContentFilesRepository } from './repositories/ContentFilesRepository';
import { PointerHistoryRepository } from './repositories/PointerHistoryRepository';
import { LastDeployedPointersRepository } from './repositories/LastDeployedPointersRepository';
import { FailedDeploymentsRepository } from './repositories/FailedDeploymentsRepository';
import { DeploymentDeltasRepository } from './repositories/DeploymentDeltasRepository';
import { DenylistRepository } from './repositories/DenylistRepository';
import { retry } from '../helpers/RetryHelper';

export type Repository = IDatabase<IExtensions> & IExtensions
export type RepositoryTask = ITask<IExtensions> & IExtensions

export interface IExtensions {
    deployments: DeploymentsRepository,
    migrationData: MigrationDataRepository,
    content: ContentFilesRepository,
    pointerHistory: PointerHistoryRepository,
    lastDeployedPointers: LastDeployedPointersRepository,
    failedDeployments: FailedDeploymentsRepository,
    deploymentDeltas: DeploymentDeltasRepository,
    denylist: DenylistRepository,
}

export type DBConnection = {
    host: string,
    port: number,
}

export type DBCredentials = {
    database: string,
    user: string,
    password: string,
}

/**
 * Builds the repository by connection to the content database. If it isn't present, then it tries to connect with the root user and creates the content database and user.
 */
export async function build(connection: DBConnection, contentCredentials: DBCredentials, rootCredentials?: DBCredentials): Promise<Repository> {
    try {
        return await connectTo(connection, contentCredentials)
    } catch (error) {
        if (rootCredentials) {
            console.log('Trying to create database...')
            // Probably the content database doesn't exist. So we try to create it
            const rootRepo = await connectTo(connection, rootCredentials)
            await rootRepo.query(`CREATE USER ${contentCredentials.user} WITH PASSWORD $1`, [contentCredentials.password])
            await rootRepo.query(`CREATE DATABASE ${contentCredentials.database}`)
            await rootRepo.query(`GRANT ALL PRIVILEGES ON DATABASE ${contentCredentials.database} TO ${contentCredentials.user}`)

            return connectTo(connection, contentCredentials)
        } else {
            throw error
        }
    }
}

async function connectTo(connection: DBConnection, credentials: DBCredentials) {
    const initOptions: IInitOptions<IExtensions> = {

        extend(obj: Repository, dc: any) {
            obj.deployments = new DeploymentsRepository(obj);
            obj.migrationData = new MigrationDataRepository(obj);
            obj.content = new ContentFilesRepository(obj);
            obj.pointerHistory = new PointerHistoryRepository(obj);
            obj.lastDeployedPointers = new LastDeployedPointersRepository(obj);
            obj.deploymentDeltas = new DeploymentDeltasRepository(obj);
            obj.failedDeployments = new FailedDeploymentsRepository(obj);
            obj.denylist = new DenylistRepository(obj);
        },

        error(err, e) {
            console.log(`Failed to query database. Error was ${err}`)
            console.log(`Query was ${e.query}`)
        }
    };

    const pgp: IMain = pgPromise(initOptions);

    const dbConfig = {
        ...connection,
        ...credentials,
    }

    // Build the database
    const db: Repository = pgp(dbConfig);

    // Make sure we can connect to it
    await retry(async () => {
        const connection = await db.connect()
        connection.done(true)
    }, 6, 'connect to the database', '10s')

    return db
}
