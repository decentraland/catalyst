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

export type AppComponents = {
  metrics: IMetricsComponent<keyof typeof metrics>
  fetcher: IFetchComponent
  downloadQueue: IJobQueue
  logs: ILoggerComponent
  database: IDatabaseComponent
  deployedEntitiesFilter: IBloomFilterComponent
  deployer: MetaverseContentService & ClusterDeploymentsService
  staticConfigs: {
    contentStorageFolder: string
  }
  batchDeployer: IDeployerComponent
  synchronizationJobManager: JobLifecycleManagerComponent
}

export type CannonicalEntityDeployment = { entity: RemoteEntityDeployment; servers: string[] }
