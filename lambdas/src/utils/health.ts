import { SynchronizationState } from 'decentraland-katalyst-commons/synchronizationState'
import { Logger } from 'log4js'
import fetch from 'node-fetch'
import { SmartContentClient } from './SmartContentClient'

export class HealthStatus {
  static HEALTHY = new HealthStatus('Healthy')
  static LOADED = new HealthStatus('Loaded')
  static UNHEALTHY = new HealthStatus('Unhealthy')
  static DOWN = new HealthStatus('Down')

  constructor(private name) {}

  getName() {
    return this.name
  }

  static compare(a: HealthStatus, b: HealthStatus): number {
    if (a === b) return 0

    // Health is lower than anything else
    if (a === HealthStatus.HEALTHY) return -1
    if (b === HealthStatus.HEALTHY) return 1

    // Either is healthy so the Loaded one is the lowest
    if (a === HealthStatus.LOADED) return -1
    if (b === HealthStatus.LOADED) return 1

    // Either is healthy nor loaded so the UNHEALTHY one is the lowest
    if (a === HealthStatus.UNHEALTHY) return -1
    if (b === HealthStatus.UNHEALTHY) return 1

    if (a === HealthStatus.DOWN) return -1
    if (b === HealthStatus.DOWN) return 1

    return 0
  }
}

export async function refreshContentServerStatus(
  contentService: SmartContentClient,
  maxSynchronizationTimeInSeconds: number,
  maxDeploymentObtentionTimeInSeconds: number,
  logger: Logger
): Promise<HealthStatus> {
  let healthStatus: HealthStatus
  try {
    const url = await contentService.getClientUrl()
    const fetchContentServerStatus = (await fetch(url + '/status')).json()
    const [serverStatus, obtainDeploymentTime] = await Promise.all([
      await fetchContentServerStatus,
      await timeContentDeployments(url)
    ])
    const synchronizationDiffInSeconds =
      new Date(serverStatus.currentTime - serverStatus.synchronizationStatus.lastSyncWithOtherServers).getTime() / 1000
    const hasOldInformation = synchronizationDiffInSeconds > maxSynchronizationTimeInSeconds

    const obtainDeploymentTimeInSeconds = obtainDeploymentTime / 1000
    const obtainDeploymentTimeIsTooLong = obtainDeploymentTimeInSeconds > maxDeploymentObtentionTimeInSeconds
    const isBootstrapping = serverStatus.synchronizationStatus === SynchronizationState.BOOTSTRAPPING

    if (hasOldInformation || isBootstrapping) {
      healthStatus = HealthStatus.UNHEALTHY
    } else if (obtainDeploymentTimeIsTooLong) {
      healthStatus = HealthStatus.LOADED
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
