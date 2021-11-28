import { JobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import {
  IDeployerComponent,
  RemoteEntityDeployment,
  SnapshotsFetcherComponents
} from '@dcl/snapshots-fetcher/dist/types'
import { metricsComponent } from './metrics'
import { IDatabaseComponent } from './ports/postgres'
import { ClusterDeploymentsService, MetaverseContentService } from './service/Service'

// Minimum amount of needed stuff to make the sync work
export type DeployerComponent = Pick<
  MetaverseContentService & ClusterDeploymentsService,
  'getAllFailedDeployments' | 'deployEntity' | 'reportErrorDuringSync' | 'listenToDeployments'
>

export type AppComponents = SnapshotsFetcherComponents & {
  metrics: typeof metricsComponent
  deployer: DeployerComponent
  database: IDatabaseComponent
  staticConfigs: {
    contentStorageFolder: string
  }
}

export type SynchronizerDeployerComponents = AppComponents & {
  batchDeployer: IDeployerComponent
  synchronizationJobManager: JobLifecycleManagerComponent
}

export type CannonicalEntityDeployment = { entity: RemoteEntityDeployment; servers: string[] }
