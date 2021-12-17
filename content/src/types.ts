import { JobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { IJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { IDeployerComponent, RemoteEntityDeployment } from '@dcl/snapshots-fetcher/dist/types'
import { IFetchComponent } from '@well-known-components/http-server'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { metrics } from './metrics'
import { IBloomFilterComponent } from './ports/bloomFilter'
import { IDatabaseComponent } from './ports/postgres'
import { IStatusComponent } from './ports/status'
import { ClusterDeploymentsService, MetaverseContentService } from './service/Service'
// Minimum amount of needed stuff to make the sync work

export type AppComponents = {
  metrics: IMetricsComponent<keyof typeof metrics>
  fetcher: IFetchComponent
  downloadQueue: IJobQueue
  logs: ILoggerComponent
  database: IDatabaseComponent
  deployer: MetaverseContentService & ClusterDeploymentsService
  staticConfigs: {
    contentStorageFolder: string
  }
  batchDeployer: IDeployerComponent & { start(): Promise<void> }
  synchronizationJobManager: JobLifecycleManagerComponent
  deployedEntitiesFilter: IBloomFilterComponent
  status: IStatusComponent
}

export type Timestamp = number

export enum EntityVersion {
  V2 = 'v2',
  V3 = 'v3',
  V4 = 'v4'
}

export type CannonicalEntityDeployment = { entity: RemoteEntityDeployment; servers: string[] }
