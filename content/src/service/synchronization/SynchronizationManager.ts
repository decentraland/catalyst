import { AppComponents, IStatusCapableComponent } from '../../types'

type ContentSyncComponents = Pick<
  AppComponents,
  'logs' | 'synchronizationJobManager' | 'contentCluster' | 'retryFailedDeployments' | 'metrics'
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
        components.metrics.observe('dcl_content_server_sync_state', {}, 1)
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
        components.metrics.observe('dcl_content_server_sync_state', {}, 2)
        setDesiredJobs()
      })

      // Configure retry for failed deployments
      components.retryFailedDeployments.schedule().catch(() => {
        logger.error('There was an error during the retry of failed deployments.')
      })
    }
  }
}
