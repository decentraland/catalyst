import { IContentStorageComponent, IFileSystemComponent } from '@dcl/catalyst-storage'
import { IContentValidator } from './adapters/content-validator'
import { IAuthenticator } from './logic/authenticator'
import { ServerValidator } from './logic/server-validator'
import { EntityType, SyncDeployment } from '@dcl/schemas'
import { IDeployerComponent, SynchronizerComponent } from '@dcl/snapshots-fetcher'
import { IJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { ISnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import {
  IConfigComponent,
  IFetchComponent,
  IHttpServerComponent,
  ILoggerComponent,
  IMetricsComponent,
  ITracerComponent
} from '@well-known-components/interfaces'
import { FormDataContext } from '@well-known-components/multipart-wrapper'
import { HTTPProvider } from 'eth-connect'
import qs from 'qs'
import { Environment } from './Environment'
import { metricsDeclaration } from './metrics'
import { MigrationExecutor } from './migrations/migration-executor'
import { IActiveEntitiesRepository } from './adapters/active-entities-repository'
import { ActiveEntities } from './logic/active-entities'
import { IContentFilesRepository } from './adapters/content-files-repository'
import { DAOComponent } from './adapters/dao-client'
import { Denylist } from './adapters/denylist'
import { IDeploymentsRepository } from './adapters/deployments-repository'
import { IDeployRateLimiterComponent } from './adapters/deploy-rate-limiter'
import { IFailedDeploymentsRepository } from './adapters/failed-deployments-repository'
import { IPointersRepository } from './adapters/pointers-repository'
import { ISnapshotsRepository } from './adapters/snapshots-repository'
import { DeployedEntitiesBloomFilter } from './adapters/deployed-entities-bloom-filter'
import { Deployer } from './logic/deployment-service'
import { IPointerLockManager } from './logic/pointer-lock-manager'
import { IFailedDeploymentsComponent } from './ports/failedDeployments'
import { IDatabaseComponent } from './ports/postgres'
import { ISequentialTaskExecutorComponent } from './adapters/sequential-task-executor'
import { SnapshotGenerator } from './ports/snapshotGenerator'
import { SynchronizationState } from './adapters/synchronization-state'
import { SystemProperties } from './adapters/system-properties'
import { GarbageCollectionManager } from './logic/garbage-collection'
import { PointerManager } from './logic/pointer-manager'
import { IChallengeSupervisor } from './logic/challenge-supervisor'
import { IContentClusterComponent } from './logic/peer-cluster'
import { IRetryFailedDeploymentsComponent } from './logic/retry-failed-deployments'
import { ProcessedSnapshotsStorageComponent } from './ports/processedSnapshotStorage'
import ms from 'ms'
import { IDeploymentsComponent } from './logic/deployments'
import { IJobComponent } from '@dcl/job-component'

// Minimum amount of needed stuff to make the sync work

export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

export type FormHandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  FormDataContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>
export type AppComponents = {
  env: Environment
  metrics: IMetricsComponent<keyof typeof metricsDeclaration>
  fetcher: IFetchComponent
  downloadQueue: IJobQueue
  logs: ILoggerComponent
  database: IDatabaseComponent
  activeEntitiesRepository: IActiveEntitiesRepository
  contentFilesRepository: IContentFilesRepository
  deploymentsRepository: IDeploymentsRepository
  failedDeploymentsRepository: IFailedDeploymentsRepository
  pointersRepository: IPointersRepository
  snapshotsRepository: ISnapshotsRepository
  config: IConfigComponent
  deployer: Deployer
  pointerLockManager: IPointerLockManager
  staticConfigs: {
    contentStorageFolder: string
    tmpDownloadFolder: string
  }
  batchDeployer: IDeployerComponent
  synchronizer: SynchronizerComponent
  deployments: IDeploymentsComponent
  materializedViewUpdateJob: IJobComponent
  synchronizationState: SynchronizationState
  deployedEntitiesBloomFilter: DeployedEntitiesBloomFilter
  challengeSupervisor: IChallengeSupervisor
  contentCluster: IContentClusterComponent
  pointerManager: PointerManager
  failedDeployments: IFailedDeploymentsComponent
  deployRateLimiter: IDeployRateLimiterComponent
  storage: IContentStorageComponent
  authenticator: IAuthenticator
  migrationManager: MigrationExecutor
  serverValidator: ServerValidator
  validator: IContentValidator
  garbageCollectionManager: GarbageCollectionManager
  systemProperties: SystemProperties
  daoClient: DAOComponent
  server: IHttpServerComponent<GlobalContext>
  retryFailedDeployments: IRetryFailedDeploymentsComponent
  activeEntities: ActiveEntities
  sequentialExecutor: ISequentialTaskExecutorComponent
  denylist: Denylist
  fs: IFileSystemComponent
  snapshotGenerator: SnapshotGenerator
  processedSnapshotStorage: ProcessedSnapshotsStorageComponent
  snapshotStorage: ISnapshotStorageComponent
  l1Provider: HTTPProvider
  tracer: ITracerComponent
}

export type GlobalContext = {
  components: AppComponents
}

export type MaintenanceComponents = {
  env: Environment
  metrics: IMetricsComponent<keyof typeof metricsDeclaration>
  logs: ILoggerComponent
  database: IDatabaseComponent
  storage: IContentStorageComponent
  fs: IFileSystemComponent
  migrationManager: MigrationExecutor
}

export type Timestamp = number

export enum EntityVersion {
  V2 = 'v2',
  V3 = 'v3',
  V4 = 'v4'
}

export type CannonicalEntityDeployment = { entity: SyncDeployment; servers: string[] }

export type StatusProbeResult = {
  /** name is used as unique key for the status map */
  name: string
  data: Record<string, any>
  // ready?: boolean
}

export type IStatusCapableComponent = {
  getComponentStatus(): Promise<StatusProbeResult>
}

export function parseEntityType(strType: string): EntityType {
  if (strType.endsWith('s')) {
    strType = strType.slice(0, -1)
  }
  strType = strType.toUpperCase().trim()
  const type = EntityType[strType]
  return type
}

export type DeploymentId = number

export type Pagination = {
  offset: number
  limit: number
  pageSize: number
  pageNum: number
}

export type QueryParams = qs.ParsedQs

export type AnyObject = Record<string, unknown>

export { BaseDomainError, InvalidRequestError, NotFoundError } from './errors'

export enum DeploymentField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata',
  AUDIT_INFO = 'auditInfo'
}

export const PROFILE_DURATION = ms('1 year')
