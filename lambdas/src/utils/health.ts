import { SynchronizationState } from 'decentraland-katalyst-commons/synchronizationState'
import { Logger } from 'log4js'
import ms from 'ms'
import fetch from 'node-fetch'
import { SmartContentClient } from './SmartContentClient'

export enum HealthStatus {
  HEALTHY = 'Healthy',
  UNHEALTHY = 'Unhealthy',
  DOWN = 'Down'
}

export async function refreshContentServerStatus(
  contentService: SmartContentClient,
  maxSynchronizationTime: string,
  maxDeploymentObtentionTime: string,
  logger: Logger
): Promise<HealthStatus> {
  let healthStatus: HealthStatus
  try {
    const url = await contentService.getClientUrl()
    const fetchContentServerStatus = contentService.fetchContentStatus()
    const [serverStatus, obtainDeploymentTime] = await Promise.all([
      await fetchContentServerStatus,
      await timeContentDeployments(url)
    ])
    const synchronizationDiffInSeconds = new Date(
      serverStatus.currentTime - (serverStatus as any).synchronizationStatus.lastSyncWithOtherServers
    ).getTime()

    const hasOldInformation = synchronizationDiffInSeconds > ms(maxSynchronizationTime)

    const obtainDeploymentTimeInSeconds = obtainDeploymentTime

    const obtainDeploymentTimeIsTooLong = obtainDeploymentTimeInSeconds > ms(maxDeploymentObtentionTime)
    const isBootstrapping = (serverStatus as any).synchronizationStatus === SynchronizationState.BOOTSTRAPPING

    if (hasOldInformation || isBootstrapping || obtainDeploymentTimeIsTooLong) {
      healthStatus = HealthStatus.UNHEALTHY
    } else {
      healthStatus = HealthStatus.HEALTHY
    }
  } catch (error) {
    logger.info('error fetching content server status', error)
    healthStatus = HealthStatus.DOWN
  }

  return healthStatus
}

async function timeContentDeployments(url: string): Promise<number> {
  const startingTime = Date.now()
  await (await fetch(url + '/deployments?limit=1')).json()
  const endingTime = Date.now()

  return endingTime - startingTime
}
