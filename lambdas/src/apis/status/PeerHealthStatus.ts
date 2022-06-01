import log4js, { Logger } from 'log4js'
import { HealthStatus, refreshContentServerStatus } from '../../apis/status/health'
import { SmartContentClient } from '../../utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '../../utils/TimeRefreshedDataHolder'
import fetch from 'node-fetch'

const REFRESH_TIME: string = '1m'

type PeerStatus = {
  lambda: HealthStatus
  content: HealthStatus
  comms: HealthStatus
}

export default class PeerHealthStatus {
  private static LOGGER: Logger = log4js.getLogger('ServiceImpl')

  private contentServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private commsServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private lambdaServerStatus: TimeRefreshedDataHolder<HealthStatus>

  constructor(
    contentClient: SmartContentClient,
    maxSynchronizationTime: string,
    maxDeploymentObtentionTime: string,
    private readonly commsServerAddress: string
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

  async getPeerStatus(): Promise<PeerStatus> {
    const [lambda, content, comms] = await Promise.all([
      this.lambdaServerStatus.get(),
      this.contentServerStatus.get(),
      this.commsServerStatus.get()
    ])

    const serversStatus = {
      lambda,
      content,
      comms
    }

    return serversStatus
  }

  public async refreshLambdaServerStatus(): Promise<HealthStatus> {
    return HealthStatus.HEALTHY
  }

  public async refreshCommsServerStatus(): Promise<HealthStatus> {
    try {
      await (await fetch(this.commsServerAddress + '/status')).json()

      return HealthStatus.HEALTHY
    } catch (error) {
      PeerHealthStatus.LOGGER.info('error fetching comms server status', error)

      return HealthStatus.DOWN
    }
  }
}
