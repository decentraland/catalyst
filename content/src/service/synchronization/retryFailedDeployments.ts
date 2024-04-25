import { IBaseComponent } from '@well-known-components/interfaces'
import { EnvironmentConfig } from '../../Environment'
import { retryFailedDeploymentExecution } from '../../logic/deployments'
import { AppComponents } from '../../types'
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
  let ac: AbortController | undefined = new AbortController()
  const signal = ac.signal

  let running = false
  return {
    start: async () => {
      running = true
      logger.debug('Starting retry failed deployments')
    },
    stop: async () => {
      running = false
      if (ac) {
        ac.abort()
      }
      ac = undefined
      logger.debug('Stopping retry failed deployments')
    },
    schedule: async () => {
      while (running) {
        await setTimeout(retryDelay, null, { signal })
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
