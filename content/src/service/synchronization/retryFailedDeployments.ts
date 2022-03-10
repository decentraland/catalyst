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
    | 'storage'
  >
): IRetryFailedDeploymentsComponent => {
  const retryDelay = components.env.getConfig<number>(EnvironmentConfig.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME)
  const logger = components.logs.getLogger('RetryFailedDeployments')
  let timeoutId: NodeJS.Timeout | undefined
  let running = false
  return {
    start: async () => {
      running = true
      logger.debug('Starting retry failed deployments')
    },
    stop: async () => {
      running = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      logger.debug('Stopping retry failed deployments')
    },
    schedule: async () => {
      while (running) {
        await new Promise((resolve) => {
          timeoutId = setTimeout(resolve, retryDelay)
        })
        if (!running) return
        try {
          logger.debug('Executing retry failed deployments')
          await retryFailedDeploymentExecution(components, logger)
        } catch (err: any) {
          logger.error(err)
        }
      }
    }
  }
}
