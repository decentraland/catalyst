import { DAOClient } from '@catalyst/commons'
import { Validator } from '@dcl/content-validator'
import { JobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { IJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { IDeployerComponent, RemoteEntityDeployment } from '@dcl/snapshots-fetcher/dist/types'
import { IFetchComponent } from '@well-known-components/http-server'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { Fetcher } from 'dcl-catalyst-commons'
import { Controller } from './controller/Controller'
import { Environment } from './Environment'
import { ISequentialTaskExecutorComponent } from './ports/sequecuentialTaskExecutor'
import { metricsDeclaration } from './metrics'
import { MigrationManager } from './migrations/MigrationManager'
import { DeploymentListComponent } from './ports/deploymentListComponent'
import { IFailedDeploymentsCacheComponent } from './ports/failedDeploymentsCache'
import { IDatabaseComponent } from './ports/postgres'
import { Repository } from './repository/Repository'
import { ContentAuthenticator } from './service/auth/Authenticator'
import { DeploymentManager } from './service/deployments/DeploymentManager'
import { GarbageCollectionManager } from './service/garbage-collection/GarbageCollectionManager'
import { PointerManager } from './service/pointers/PointerManager'
import { Server } from './service/Server'
import { MetaverseContentService } from './service/Service'
import { ISnapshotManager } from './service/snapshots/SnapshotManager'
import { IChallengeSupervisor } from './service/synchronization/ChallengeSupervisor'
import { ContentCluster } from './service/synchronization/ContentCluster'
import { IRetryFailedDeploymentsComponent } from './service/synchronization/retryFailedDeployments'
import { ISynchronizationManager } from './service/synchronization/SynchronizationManager'
import { SystemPropertiesManager } from './service/system-properties/SystemProperties'
import { ServerValidator } from './service/validations/server'
import { ContentStorage } from './storage/ContentStorage'

// Minimum amount of needed stuff to make the sync work

export type AppComponents = {
  env: Environment
  metrics: IMetricsComponent<keyof typeof metricsDeclaration>
  fetcher: IFetchComponent
  downloadQueue: IJobQueue
  logs: ILoggerComponent
  database: IDatabaseComponent
  deployer: MetaverseContentService
  staticConfigs: {
    contentStorageFolder: string
    tmpDownloadFolder: string
  }
  batchDeployer: IDeployerComponent
  synchronizationJobManager: JobLifecycleManagerComponent
  synchronizationManager: ISynchronizationManager
  deployedEntitiesFilter: DeploymentListComponent
  controller: Controller
  snapshotManager: ISnapshotManager
  challengeSupervisor: IChallengeSupervisor
  contentCluster: ContentCluster
  pointerManager: PointerManager
  failedDeploymentsCache: IFailedDeploymentsCacheComponent
  deploymentManager: DeploymentManager
  storage: ContentStorage
  authenticator: ContentAuthenticator
  migrationManager: MigrationManager
  serverValidator: ServerValidator
  validator: Validator
  garbageCollectionManager: GarbageCollectionManager
  systemPropertiesManager: SystemPropertiesManager
  catalystFetcher: Fetcher
  daoClient: DAOClient
  server: Server
  retryFailedDeployments: IRetryFailedDeploymentsComponent
  sequentialExecutor: ISequentialTaskExecutorComponent

  // this will be replaced by `database` and removed from here
  repository: Repository
}

export type Timestamp = number

export enum EntityVersion {
  V2 = 'v2',
  V3 = 'v3',
  V4 = 'v4'
}

export type CannonicalEntityDeployment = { entity: RemoteEntityDeployment; servers: string[] }

export type StatusProbeResult = {
  /** name is used as unique key for the status map */
  name: string
  data: Record<string, any>
  // ready?: boolean
}

export type IStatusCapableComponent = {
  getComponentStatus(): Promise<StatusProbeResult>
}
