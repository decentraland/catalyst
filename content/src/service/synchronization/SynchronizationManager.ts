import { AppComponents, IStatusCapableComponent } from '../../types'

type ContentSyncComponents = Pick<
  AppComponents,
  | 'staticConfigs'
  | 'logs'
  | 'downloadQueue'
  | 'metrics'
  | 'fetcher'
  | 'synchronizationJobManager'
  | 'deployer'
  | 'contentCluster'
  | 'failedDeploymentsCache'
  | 'storage'
>

export enum SynchronizationState {
  BOOTSTRAPPING = 'Bootstrapping',
  SYNCED = 'Synced',
  SYNCING = 'Syncing'
}

export type ISynchronizationManager = IStatusCapableComponent & {
  syncWithServers(): Promise<void>
}

export const createSynchronizationManager = (components: ContentSyncComponents): ISynchronizationManager => {
  const logger = components.logs.getLogger('ClusterSynchronizationManager')

  let synchronizationState = SynchronizationState.BOOTSTRAPPING

  return {
    getComponentStatus: async () => {
      const clusterStatus = components.contentCluster.getStatus()
      return {
        name: 'synchronizationStatus',
        data: {
          ...clusterStatus,
          synchronizationState: synchronizationState
        }
      }
    },
    syncWithServers: async () => {
      logger.info(`Starting to sync entities from servers pointer changes`)
      const setDesiredJobs = () => {
        synchronizationState = SynchronizationState.SYNCING
        const desiredJobNames = new Set(components.contentCluster.getAllServersInCluster())
        // the job names are the contentServerUrl
        return components.synchronizationJobManager.setDesiredJobs(desiredJobNames)
      }

      // start the sync jobs
      setDesiredJobs()

      // setDesiredJobs every time we synchronize the DAO servers, this is an asynchronous job.
      // the setDesiredJobs function handles the lifecycle od those async jobs.
      components.contentCluster.onSyncFinished(() => {
        synchronizationState = SynchronizationState.SYNCED
        setDesiredJobs()
      })

      // Configure retry for failed deployments
      components.retryFailedDeployments.schedule().catch(() => {
        logger.error('There was an error during the retry of failed deployments.')
      })
    }
  }
}
