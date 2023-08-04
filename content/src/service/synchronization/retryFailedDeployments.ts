import { IBaseComponent } from '@well-known-components/interfaces'
import { EnvironmentConfig } from '../../Environment.js'
import { retryFailedDeploymentExecution } from '../../logic/deployments.js'
import { AppComponents } from '../../types.js'
import { setTimeout } from 'timers/promises'

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
    | 'failedDeployments'
    | 'storage'
  >
): IRetryFailedDeploymentsComponent => {
  const retryDelay = components.env.getConfig<number>(EnvironmentConfig.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME)
  const logger = components.logs.getLogger('RetryFailedDeployments')
  const ac = new AbortController()

  let running = false
  return {
    start: async () => {
      running = true
      logger.debug('Starting retry failed deployments')
    },
    stop: async () => {
      running = false
      ac.abort()
      logger.debug('Stopping retry failed deployments')
    },
    schedule: async () => {
      while (running) {
        await setTimeout(retryDelay, null, { signal: ac.signal })
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
