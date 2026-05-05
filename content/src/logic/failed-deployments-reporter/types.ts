import { FailedDeployment } from '../../adapters/failed-deployments-cache'

export type IFailedDeploymentsReporter = {
  reportFailure(deployment: FailedDeployment): Promise<void>
}
