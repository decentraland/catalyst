import { IContentStorageComponent, IFileSystemComponent } from '@dcl/catalyst-storage'
import { ExternalCalls, ValidateFn } from '@dcl/content-validator'
import { EntityType, SyncDeployment } from '@dcl/schemas'
import { IDeployerComponent, SynchronizerComponent } from '@dcl/snapshots-fetcher'
import { IJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { ISnapshotStorageComponent } from '@dcl/snapshots-fetcher/dist/types'
import {
  IConfigComponent,
  IFetchComponent,
  IHttpServerComponent,
  ILoggerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { FormDataContext } from '@well-known-components/multipart-wrapper'
import { HTTPProvider } from 'eth-connect'
import qs from 'qs'
import { Environment } from './Environment'
import { metricsDeclaration } from './metrics'
import { MigrationExecutor } from './migrations/migration-executor'
import { ActiveEntities } from './ports/activeEntities'
import { Clock } from './ports/clock'
import { DAOComponent } from './ports/dao-servers-getter'
import { Denylist } from './ports/denylist'
import { IDeployRateLimiterComponent } from './ports/deployRateLimiterComponent'
import { DeployedEntitiesBloomFilter } from './ports/deployedEntitiesBloomFilter'
import { Deployer } from './ports/deployer'
import { IFailedDeploymentsComponent } from './ports/failedDeployments'
import { IDatabaseComponent } from './ports/postgres'
import { ISequentialTaskExecutorComponent } from './ports/sequecuentialTaskExecutor'
import { SnapshotGenerator } from './ports/snapshotGenerator'
import { SynchronizationState } from './ports/synchronizationState'
import { SystemProperties } from './ports/system-properties'
import { ContentAuthenticator } from './service/auth/Authenticator'
import { GarbageCollectionManager } from './service/garbage-collection/GarbageCollectionManager'
import { PointerManager } from './service/pointers/PointerManager'
import { IChallengeSupervisor } from './service/synchronization/ChallengeSupervisor'
import { ContentCluster } from './service/synchronization/ContentCluster'
import { IRetryFailedDeploymentsComponent } from './service/synchronization/retryFailedDeployments'
import { ServerValidator } from './service/validations/server'
import { ProcessedSnapshotsStorageComponent } from './ports/processedSnapshotStorage'
import ms from 'ms'

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
  config: IConfigComponent
  deployer: Deployer
  staticConfigs: {
    contentStorageFolder: string
    tmpDownloadFolder: string
  }
  batchDeployer: IDeployerComponent
  synchronizer: SynchronizerComponent
  synchronizationState: SynchronizationState
  deployedEntitiesBloomFilter: DeployedEntitiesBloomFilter
  challengeSupervisor: IChallengeSupervisor
  contentCluster: ContentCluster
  pointerManager: PointerManager
  failedDeployments: IFailedDeploymentsComponent
  deployRateLimiter: IDeployRateLimiterComponent
  storage: IContentStorageComponent
  authenticator: ContentAuthenticator
  migrationManager: MigrationExecutor
  serverValidator: ServerValidator
  externalCalls: ExternalCalls
  validator: {
    validate: ValidateFn
  }
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
  clock: Clock
  snapshotStorage: ISnapshotStorageComponent
  l1Provider: HTTPProvider
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

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export enum DeploymentField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata',
  AUDIT_INFO = 'auditInfo'
}

export const PROFILE_DURATION = ms('1 year')
