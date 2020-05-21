import log4js from 'log4js'
import pgPromise, { IInitOptions, IMain } from 'pg-promise';
import { Environment, EnvironmentConfig } from "../Environment";
import { Repository, IExtensions } from './Repository';
import { DeploymentsRepository } from './repositories/DeploymentsRepository';
import { MigrationDataRepository } from './repositories/MigrationDataRepository';
import { ContentFilesRepository } from './repositories/ContentFilesRepository';
import { PointerHistoryRepository } from './repositories/PointerHistoryRepository';
import { LastDeployedPointersRepository } from './repositories/LastDeployedPointersRepository';
import { DeploymentDeltasRepository } from './repositories/DeploymentDeltasRepository';
import { DenylistRepository } from './repositories/DenylistRepository';
import { FailedDeploymentsRepository } from './repositories/FailedDeploymentsRepository';
import { retry } from '../helpers/RetryHelper';

export class RepositoryFactory {

    private static readonly LOGGER = log4js.getLogger('Repository');

    static async create(env: Environment): Promise<Repository> {
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
                RepositoryFactory.LOGGER.debug(`Failed to query database. Error was ${err}`)
                RepositoryFactory.LOGGER.debug(`Query was ${e.query}`)
            }
        };

        const pgp: IMain = pgPromise(initOptions);

        const dbConfig = {
            port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
            host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
            database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
            user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
            password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
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

}

