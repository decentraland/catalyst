import { IBaseComponent } from '@well-known-components/interfaces'
import { EnvironmentConfig } from '../../Environment'
import { retryFailedDeploymentExecution } from '../../logic/deployments'
import { AppComponents } from '../../types'

export type IRetryFailedDeploymentsComponent = IBaseComponent & {
  schedule: () => Promise<void>
}
/**
 * This component schedules the retry of failed deployments.
 */
export const createRetryFailedDeployments = (
  components: Pick<
    AppComponents,
    | 'env'
    | 'metrics'
    | 'staticConfigs'
    | 'fetcher'
    | 'downloadQueue'
    | 'logs'
    | 'deployer'
    | 'contentCluster'
    | 'failedDeploymentsCache'
  >
): IRetryFailedDeploymentsComponent => {
  const retryDelay = components.env.getConfig<number>(EnvironmentConfig.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME)
  const logger = components.logs.getLogger('RetryFailedDeployments')
  let timeoutId: NodeJS.Timeout | undefined
  let running = false
  return {
    start: async () => {
      running = true
    },
    stop: async () => {
      running = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    },
    schedule: async () => {
      while (running) {
        timeoutId = setTimeout(async () => {}, retryDelay)
        try {
          await retryFailedDeploymentExecution(components, logger)
        } catch (err: any) {
          logger.error(err)
        }
      }
    }
  }
}
