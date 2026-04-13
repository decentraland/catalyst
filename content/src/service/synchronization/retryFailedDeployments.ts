import { createJobComponent } from '@dcl/job-component'
import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { EnvironmentConfig } from '../../Environment'
import { retryFailedDeploymentExecution } from '../../logic/deployments'
import { AppComponents } from '../../types'

export type IRetryFailedDeploymentsComponent = IBaseComponent & {
  schedule: () => Promise<void>
}
/**
 * This component schedules the retry of failed deployments.
 * The job is not started automatically — it waits for `schedule()` to be called
 * after sync bootstrap finishes.
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

  const job = createJobComponent(
    { logs: components.logs },
    async () => {
      logger.debug('Executing retry failed deployments')
      await retryFailedDeploymentExecution(components, logger)
    },
    retryDelay,
    {
      onError: (error: any) => {
        logger.error(error)
      }
    }
  )

  return {
    start: async () => {
      logger.debug('Starting retry failed deployments')
    },
    stop: async () => {
      logger.debug('Stopping retry failed deployments')
      await job[STOP_COMPONENT]?.()
    },
    schedule: async () => {
      await job[START_COMPONENT]?.(undefined as any)
    }
  }
}
