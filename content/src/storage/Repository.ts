import { IDatabase, ITask } from 'pg-promise';
import { DeploymentsRepository } from './repositories/DeploymentsRepository';
import { MigrationDataRepository } from './repositories/MigrationDataRepository';
import { ContentFilesRepository } from './repositories/ContentFilesRepository';
import { PointerHistoryRepository } from './repositories/PointerHistoryRepository';
import { LastDeployedPointersRepository } from './repositories/LastDeployedPointersRepository';
import { FailedDeploymentsRepository } from './repositories/FailedDeploymentsRepository';
import { DeploymentDeltasRepository } from './repositories/DeploymentDeltasRepository';
import { DenylistRepository } from './repositories/DenylistRepository';

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
