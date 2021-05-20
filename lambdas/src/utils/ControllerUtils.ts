import { Fetcher } from 'dcl-catalyst-commons'
import { SynchronizationState } from 'decentraland-katalyst-commons/synchronizationState'
import { Logger } from 'log4js'
import fetch from 'node-fetch'
import { SmartContentClient } from './SmartContentClient'

const INTERNAL_COMMS_SERVER_URL: string = `http://comms-server:6969`

export function asArray<T>(elements: T[] | T): T[] {
  if (!elements) {
    return []
  }
  if (elements instanceof Array) {
    return elements
  }
  return [elements]
}
export function asInt(value: any): number | undefined {
  if (value) {
    const parsed = parseInt(value)
    if (!isNaN(parsed)) {
      return parsed
    }
  }
}

export async function getCommsServerUrl(logger: Logger, externalCommsServerUrl?: string): Promise<string> {
  this.commsServerUrl = externalCommsServerUrl

  try {
    const fetcher = new Fetcher()
    await fetcher.fetchJson(`${INTERNAL_COMMS_SERVER_URL}/status`, {
      attempts: 6,
      waitTime: '10s'
    })
    return INTERNAL_COMMS_SERVER_URL
  } catch {
    logger.info('Defaulting to external comms server url')
  }

  return externalCommsServerUrl || ''
}

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
