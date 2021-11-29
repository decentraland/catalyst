import { JobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { IJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { IDeployerComponent, RemoteEntityDeployment } from '@dcl/snapshots-fetcher/dist/types'
import { IFetchComponent } from '@well-known-components/http-server'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { metrics } from './metrics'
import { IBloomFilterComponent } from './ports/bloomFilter'
import { IDatabaseComponent } from './ports/postgres'
import { ClusterDeploymentsService, MetaverseContentService } from './service/Service'
// Minimum amount of needed stuff to make the sync work
export type DeployerComponent = Pick<
  MetaverseContentService & ClusterDeploymentsService,
  'getAllFailedDeployments' | 'deployEntity' | 'reportErrorDuringSync' | 'listenToDeployments'
>

export type AppComponents = {
  metrics: IMetricsComponent<keyof typeof metrics>
  fetcher: IFetchComponent
  downloadQueue: IJobQueue
  logs: ILoggerComponent
  deployer: DeployerComponent
  database: IDatabaseComponent
  deployedEntitiesFilter: IBloomFilterComponent
  staticConfigs: {
    contentStorageFolder: string
  }
  batchDeployer: IDeployerComponent
  synchronizationJobManager: JobLifecycleManagerComponent
}

export type CannonicalEntityDeployment = { entity: RemoteEntityDeployment; servers: string[] }
