import { IFetchComponent } from '@well-known-components/http-server'
import { IBaseComponent, ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { metrics } from './metrics'
import { IDatabaseComponent } from './ports/postgres'
import { ClusterDeploymentsService, MetaverseContentService } from './service/Service'
// Minimum amount of needed stuff to make the sync work

export type AppComponents = {
  metrics: IMetricsComponent<keyof typeof metrics>
  fetcher: IFetchComponent
  logs: ILoggerComponent
  deployer: MetaverseContentService & ClusterDeploymentsService
  database: IDatabaseComponent & IBaseComponent
  staticConfigs: {
    contentStorageFolder: string
  }
}

export type CannonicalEntityDeployment = { servers: string[] }
