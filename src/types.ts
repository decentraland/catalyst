import { IContentStorageComponent, IFileSystemComponent } from '@dcl/catalyst-storage'
import { IContentValidator } from './adapters/content-validator'
import { ICrypto } from './logic/crypto'
import { EntityType, SyncDeployment } from '@dcl/schemas'
import { SynchronizerComponent } from '@dcl/snapshots-fetcher'
import { IJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import {
  IConfigComponent,
  IFetchComponent,
  ILoggerComponent,
  IMetricsComponent,
  ITracerComponent
} from '@well-known-components/interfaces'
// `@dcl/http-server` v2 produces native-fetch request/response types, defined in `@dcl/core-commons`.
// Source `IHttpServerComponent` from there so handler context types match what the server provides.
import { IHttpServerComponent } from '@dcl/core-commons'
import { Field, File } from '@well-known-components/multipart-wrapper'
import { HTTPProvider } from 'eth-connect'
import qs from 'qs'
import { Environment } from './Environment'
import { metricsDeclaration } from './metrics'
import { MigrationExecutor } from './migrations/migration-executor'
import { IActiveEntitiesRepository } from './adapters/active-entities-repository'
import { ActiveEntities } from './logic/active-entities'
import { IContentFilesRepository } from './adapters/content-files-repository'
import { Denylist } from './adapters/denylist'
import { IDeploymentsRepository } from './adapters/deployments-repository'
import { IPointersRepository } from './adapters/pointers-repository'
import { ISnapshotsRepository } from './adapters/snapshots-repository'
import { DeployedEntitiesBloomFilter } from './adapters/deployed-entities-bloom-filter'
import { Deployer } from './logic/deployment-service'
import { IFailedDeploymentsComponent } from './adapters/failed-deployments'
import { IDatabaseComponent } from './adapters/database'
import { ISequentialTaskExecutorComponent } from './logic/sequential-task-executor'
import { SystemProperties } from './adapters/system-properties'
import { IGarbageCollectionComponent } from './logic/garbage-collection'
import { IContentClusterComponent } from './logic/peer-cluster'
import { SnapshotStorage } from './adapters/snapshot-storage'
import { IDeploymentsComponent } from './logic/deployments'
import { IQueryParams } from './logic/query-params'
import { IEntities } from './logic/entities'
import { ISnapshots } from './logic/snapshots'
import { ISyncOrchestrator } from './logic/sync-orchestrator'
import { IBatchDeployer } from './logic/batch-deployer'
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

/**
 * Handler context enriched with parsed multipart form data. Mirrors the shape from
 * `@well-known-components/multipart-wrapper`, but binds to the native-fetch
 * `IHttpServerComponent.DefaultContext` (from `@dcl/core-commons`) to match `@dcl/http-server` v2.
 */
export type FormDataContext<T> = IHttpServerComponent.DefaultContext<T> & {
  formData: {
    fields: Record<string, Field>
    files: Record<string, File>
  }
}

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
  pointersRepository: IPointersRepository
  snapshotsRepository: ISnapshotsRepository
  config: IConfigComponent
  deployer: Deployer
  staticConfigs: {
    contentStorageFolder: string
    tmpDownloadFolder: string
  }
  batchDeployer: IBatchDeployer
  synchronizer: SynchronizerComponent
  deployments: IDeploymentsComponent
  materializedViewUpdateJob: IJobComponent
  denylistReloadJob: IJobComponent
  snapshotGenerationJob: IJobComponent
  garbageCollectionJob: IJobComponent
  deployedEntitiesBloomFilter: DeployedEntitiesBloomFilter
  contentCluster: IContentClusterComponent
  failedDeployments: IFailedDeploymentsComponent
  storage: IContentStorageComponent
  crypto: ICrypto
  migrationManager: MigrationExecutor
  validator: IContentValidator
  garbageCollectionManager: IGarbageCollectionComponent
  systemProperties: SystemProperties
  server: IHttpServerComponent<GlobalContext>
  activeEntities: ActiveEntities
  sequentialExecutor: ISequentialTaskExecutorComponent
  denylist: Denylist
  fs: IFileSystemComponent
  snapshotStorage: SnapshotStorage
  l1Provider: HTTPProvider
  tracer: ITracerComponent
  syncOrchestrator: ISyncOrchestrator
  queryParams: IQueryParams
  entities: IEntities
  snapshots: ISnapshots
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
  contentFilesRepository: IContentFilesRepository
  deploymentsRepository: IDeploymentsRepository
  snapshotsRepository: ISnapshotsRepository
  garbageCollectionManager: IGarbageCollectionComponent
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

export enum DeploymentField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata',
  AUDIT_INFO = 'auditInfo'
}

// PROFILE_DURATION is now configurable via the PROFILE_DURATION env var (default: 1 year).
// Use env.getConfig(EnvironmentConfig.PROFILE_DURATION) instead of this constant.
