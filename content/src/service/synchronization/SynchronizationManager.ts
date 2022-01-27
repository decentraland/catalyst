import { delay } from '@catalyst/commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import ms from 'ms'
import { retryFailedDeploymentExecution } from '../../logic/deployments'
import { AppComponents, IStatusCapableComponent, StatusProbeResult } from '../../types'

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
>

export enum SynchronizationState {
  BOOTSTRAPPING = 'Bootstrapping',
  SYNCED = 'Synced',
  SYNCING = 'Syncing'
}

export class ClusterSynchronizationManager implements IStatusCapableComponent {
  private static LOGGER: ILoggerComponent.ILogger

  private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING

  constructor(public components: ContentSyncComponents) {
    ClusterSynchronizationManager.LOGGER = components.logs.getLogger('ClusterSynchronizationManager')
  }

  async getComponentStatus(): Promise<StatusProbeResult> {
    const clusterStatus = this.components.contentCluster.getStatus()
    return {
      name: 'synchronizationStatus',
      data: {
        ...clusterStatus,
        synchronizationState: this.synchronizationState
      }
    }
  }

  // This is the method that is called to sync with other catalysts
  async syncWithServers(): Promise<void> {
    ClusterSynchronizationManager.LOGGER.info(`Starting to sync entities from servers pointer changes`)
    const setDesiredJobs = () => {
      this.synchronizationState = SynchronizationState.SYNCING
      const desiredJobNames = new Set(this.components.contentCluster.getAllServersInCluster())
      // the job names are the contentServerUrl
      return this.components.synchronizationJobManager.setDesiredJobs(desiredJobNames)
    }

    // start the sync jobs
    setDesiredJobs()

    // setDesiredJobs every time we synchronize the DAO servers, this is an asynchronous job.
    // the setDesiredJobs function handles the lifecycle od those async jobs.
    this.components.contentCluster.onSyncFinished(() => {
      this.synchronizationState = SynchronizationState.SYNCED
      setDesiredJobs()
    })

    // Configure retry for failed deployments
    this.retryFailedDeployments().catch(() => {
      ClusterSynchronizationManager.LOGGER.error('There was an error during the retry of failed deployments.')
    })
  }

  // TODO: [wkc] make this a CronJob stoppable component
  private async retryFailedDeployments(): Promise<void> {
    while (true) {
      // TODO: [new-sync] Make this configurable
      await delay(ms('15m'))
      try {
        await retryFailedDeploymentExecution(this.components, ClusterSynchronizationManager.LOGGER)
      } catch (err: any) {
        ClusterSynchronizationManager.LOGGER.error(err)
      }
    }
  }
}
