import { EntityType } from 'dcl-catalyst-commons'
import { Logger } from 'log4js'
import ms from 'ms'
import { SmartContentClient } from '../../utils/SmartContentClient'

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
    const fetchContentServerStatus = contentService.fetchContentStatus()
    const [serverStatus, obtainDeploymentTime] = await Promise.all([
      await fetchContentServerStatus,
      await timeContentDeployments(contentService)
    ])
    const synchronizationDiff =
      serverStatus.currentTime - (serverStatus as any).synchronizationStatus.lastSyncWithOtherServers

    const hasOldInformation = synchronizationDiff > ms(maxSynchronizationTime)

    const obtainDeploymentTimeIsTooLong = obtainDeploymentTime > ms(maxDeploymentObtentionTime)

    if (hasOldInformation || obtainDeploymentTimeIsTooLong) {
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

async function timeContentDeployments(contentService: SmartContentClient): Promise<number> {
  const startingTime = Date.now()
  await contentService.fetchAllDeployments(
    {
      filters: { pointers: ['0,0'], onlyCurrentlyPointed: true, entityTypes: [EntityType.SCENE] }
    },
    { timeout: '30s' }
  )
  const endingTime = Date.now()

  return endingTime - startingTime
}
