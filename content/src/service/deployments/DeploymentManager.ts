import { DeploymentId, DeploymentsRepository } from '../../repository/extensions/DeploymentsRepository'

export class DeploymentManager {
  setEntitiesAsOverwritten(
    deploymentsRepository: DeploymentsRepository,
    overwritten: Set<DeploymentId>,
    overwrittenBy: DeploymentId
  ): Promise<void> {
    return deploymentsRepository.setEntitiesAsOverwritten(overwritten, overwrittenBy)
  }
}
