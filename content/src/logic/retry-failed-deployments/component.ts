import { setTimeout } from 'timers/promises'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { retryFailedDeploymentExecution } from '../deployments'
import { IRetryFailedDeploymentsComponent } from './types'

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
    | 'failedDeployments'
    | 'storage'
  >
): IRetryFailedDeploymentsComponent => {
  const retryDelay = components.env.getConfig<number>(EnvironmentConfig.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME)
  const logger = components.logs.getLogger('RetryFailedDeployments')
  let running = false
  return {
    start: async () => {
      running = true
      logger.debug('Starting retry failed deployments')
    },
    stop: async () => {
      running = false
      logger.debug('Stopping retry failed deployments')
    },
    schedule: async () => {
      while (running) {
        await setTimeout(retryDelay, null)
        if (!running) {
          return
        }
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
