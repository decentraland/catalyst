import { MetaverseContentService, ClusterDeploymentsService } from './Service'
import { Environment, Bean } from '../Environment'
import { ServiceImpl } from './ServiceImpl'
import { ServiceStorage } from './ServiceStorage'

export class ServiceFactory {
  static create(env: Environment): MetaverseContentService & ClusterDeploymentsService {
    const serviceStorage = new ServiceStorage(env.getBean(Bean.STORAGE))
    return new ServiceImpl(
      serviceStorage,
      env.getBean(Bean.POINTER_MANAGER),
      env.getBean(Bean.CONTENT_CLUSTER),
      env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER),
      env.getBean(Bean.DEPLOYMENT_MANAGER),
      env.getBean(Bean.VALIDATIONS),
      env.getBean(Bean.REPOSITORY)
    )
  }
}
