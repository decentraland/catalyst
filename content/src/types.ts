import { IFetchComponent } from '@well-known-components/http-server'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { metrics } from './metrics'
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
  logs: ILoggerComponent
  deployer: DeployerComponent
  database: IDatabaseComponent
  staticConfigs: {
    contentStorageFolder: string
  }
}

export type CannonicalEntityDeployment = { servers: string[] }
