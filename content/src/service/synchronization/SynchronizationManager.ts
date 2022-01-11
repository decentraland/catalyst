import { delay } from '@catalyst/commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import ms from 'ms'
import { FailedDeployment } from '../../ports/failedDeploymentsCache'
import { AppComponents, IStatusCapableComponent, StatusProbeResult } from '../../types'
import { DeploymentContext } from '../Service'
import { bootstrapFromSnapshots } from './bootstrapFromSnapshots'
import { deployEntityFromRemoteServer } from './deployRemoteEntity'

export interface SynchronizationManager {
  start(): Promise<void>
  stop(): Promise<void>
}

type ContentSyncComponents = Pick<
  AppComponents,
  | 'staticConfigs'
  | 'logs'
  | 'downloadQueue'
  | 'metrics'
  | 'fetcher'
  | 'synchronizationJobManager'
  | 'deployer'
  | 'batchDeployer'
  | 'contentCluster'
>

export enum SynchronizationState {
  BOOTSTRAPPING = 'Bootstrapping',
  SYNCED = 'Synced',
  SYNCING = 'Syncing'
}

export class ClusterSynchronizationManager implements SynchronizationManager, IStatusCapableComponent {
  private static LOGGER: ILoggerComponent.ILogger

  private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING

  constructor(
    public components: ContentSyncComponents,
    private readonly disableSynchronization: boolean // TODO: [new-sync] put this in components
  ) {
    ClusterSynchronizationManager.LOGGER = components.logs.getLogger('ClusterSynchronizationManager')
  }

  async start(): Promise<void> {
    if (this.disableSynchronization) {
      ClusterSynchronizationManager.LOGGER.warn(`Cluster synchronization has been disabled.`)
      return
    }

    // Sync with other servers
    await this.syncWithServers()

    // Configure retry for failed deployments
    this.retryFailedDeployments().catch(() =>
      ClusterSynchronizationManager.LOGGER.error('There was an error during the retry of failed deployments.')
    )
  }

  async stop(): Promise<void> {
    if (this.disableSynchronization) {
      // Since it was disabled, there is nothing to stop
      return Promise.resolve()
    }
    this.components.synchronizationJobManager.setDesiredJobs(new Set())
    return this.waitUntilSyncFinishes()
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
    bootstrap: {
      // Note: If any deployment was overwritten by the snapshots, then we never reach them
      ClusterSynchronizationManager.LOGGER.info(`Starting to bootstrap from snapshots`)
      await bootstrapFromSnapshots(this.components, this.components.contentCluster)
      this.synchronizationState = SynchronizationState.SYNCED
    }

    sync: {
      ClusterSynchronizationManager.LOGGER.info(`Starting to sync with servers`)
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
    }
  }

  private async retryFailedDeploymentExecution(): Promise<void> {
    // Get Failed Deployments from local storage
    const failedDeployments: FailedDeployment[] = await this.components.deployer.getAllFailedDeployments()
    ClusterSynchronizationManager.LOGGER.info(`Found ${failedDeployments.length} failed deployments.`)

    const contentServersUrls = this.components.contentCluster.getAllServersInCluster()

    // TODO: Implement an exponential backoff for retrying
    for (const failedDeployment of failedDeployments) {
      // Build Deployment from other servers
      const { entityId, entityType, authChain } = failedDeployment
      if (authChain) {
        ClusterSynchronizationManager.LOGGER.info(`Will retry to deploy entity with id: '${entityId}'`)
        try {
          await deployEntityFromRemoteServer(
            this.components,
            entityId,
            entityType,
            authChain,
            contentServersUrls,
            DeploymentContext.FIX_ATTEMPT
          )
        } catch (error) {
          ClusterSynchronizationManager.LOGGER.info(
            `Failed to fix deploy entity with id: '${entityId}'. Reason was: '${error.message}'`
          )
        }
      } else {
        ClusterSynchronizationManager.LOGGER.info(
          `Can't retry failed deployment: '${entityId}' because it lacks of authChain`
        )
      }
    }
  }

  private async retryFailedDeployments(): Promise<void> {
    while (true) {
      // TODO: [new-sync] Make this configurable
      await delay(ms('15m'))
      await this.retryFailedDeploymentExecution()
    }
  }

  private async waitUntilSyncFinishes(): Promise<void> {
    await this.components.downloadQueue.onIdle()
    await this.components.batchDeployer.onIdle()

    while (this.components.synchronizationJobManager.getRunningJobs().size) {
      await delay(ms('1s'))
    }
  }
}
