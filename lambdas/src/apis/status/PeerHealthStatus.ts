import { HealthStatus, refreshContentServerStatus } from '@katalyst/lambdas/apis/status/health'
import { getCommsServerUrl } from '@katalyst/lambdas/utils/commons'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '@katalyst/lambdas/utils/TimeRefreshedDataHolder'
import log4js, { Logger } from 'log4js'

const REFRESH_TIME: string = '1m'

export default class PeerHealthStatus {
  private static LOGGER: Logger = log4js.getLogger('ServiceImpl')

  private contentServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private commsServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private lambdaServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private commsServerUrl: string

  constructor(
    contentClient: SmartContentClient,
    maxSynchronizationTime: string,
    maxDeploymentObtentionTime: string,
    private readonly externalCommsServerAddress: string
  ) {
    this.contentServerStatus = new TimeRefreshedDataHolder(
      () =>
        refreshContentServerStatus(
          contentClient,
          maxSynchronizationTime,
          maxDeploymentObtentionTime,
          PeerHealthStatus.LOGGER
        ),
      REFRESH_TIME
    )
    this.lambdaServerStatus = new TimeRefreshedDataHolder(() => this.refreshLambdaServerStatus(), REFRESH_TIME)
    this.commsServerStatus = new TimeRefreshedDataHolder(() => this.refreshCommsServerStatus(), REFRESH_TIME)
  }

  async getPeerStatus(): Promise<Record<string, HealthStatus>> {
    const serversStatus = {
      lambda: await this.lambdaServerStatus.get(),
      content: await this.contentServerStatus.get(),
      comms: await this.commsServerStatus.get()
    }

    return serversStatus
  }

  public async refreshLambdaServerStatus(): Promise<HealthStatus> {
    return HealthStatus.HEALTHY
  }

  public async refreshCommsServerStatus(): Promise<HealthStatus> {
    if (!this.commsServerUrl) {
      this.commsServerUrl = await getCommsServerUrl(PeerHealthStatus.LOGGER, this.externalCommsServerAddress)
    }

    try {
      await (await fetch(this.commsServerUrl + '/status')).json()

      return HealthStatus.HEALTHY
    } catch (error) {
      PeerHealthStatus.LOGGER.info('error fetching comms server status', error)

      return HealthStatus.DOWN
    }
  }
}
