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

export class RepositoryFactory {

    static async create(env: Environment): Promise<Repository> {
        const initOptions: IInitOptions<IExtensions> = {

            extend(obj: Repository, dc: any) {
                obj.deployments = new DeploymentsRepository(obj);
                obj.migrationData = new MigrationDataRepository(obj);
                obj.content = new ContentFilesRepository(obj);
                obj.pointerHistory = new PointerHistoryRepository(obj);
                obj.lastDeployedPointers = new LastDeployedPointersRepository(obj);
                obj.deploymentDeltas = new DeploymentDeltasRepository(obj);
                obj.denylist = new DenylistRepository(obj);
            }
        };

        const pgp: IMain = pgPromise(initOptions);

        const dbConfig = {
            host: "localhost",
            port: 5432,
            database: env.getConfig(EnvironmentConfig.PSQL_DATABASE) as string,
            user: env.getConfig(EnvironmentConfig.PSQL_USER) as string,
            password: env.getConfig(EnvironmentConfig.PSQL_PASSWORD) as string,
        }

        // Build the database
        const db: Repository = pgp(dbConfig);

        // Make sure we can connect to it
        const connection = await db.connect()
        connection.done()

        return db
    }

}

