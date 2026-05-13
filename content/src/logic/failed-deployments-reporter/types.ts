import { FailedDeployment } from '../../adapters/failed-deployments'

export type IFailedDeploymentsReporter = {
  reportFailure(deployment: FailedDeployment): Promise<void>
}
