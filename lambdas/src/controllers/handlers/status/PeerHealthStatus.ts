import log4js, { Logger } from 'log4js'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '../../../utils/TimeRefreshedDataHolder'
import { HealthStatus, refreshContentServerStatus } from './health'

const REFRESH_TIME: string = '1m'

type PeerStatus = {
  lambda: HealthStatus
  content: HealthStatus
}

export default class PeerHealthStatus {
  private static LOGGER: Logger = log4js.getLogger('ServiceImpl')

  private contentServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private lambdaServerStatus: TimeRefreshedDataHolder<HealthStatus>

  constructor(contentClient: SmartContentClient, maxSynchronizationTime: string, maxDeploymentObtentionTime: string) {
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
  }

  async getPeerStatus(): Promise<PeerStatus> {
    const [lambda, content] = await Promise.all([this.lambdaServerStatus.get(), this.contentServerStatus.get()])

    const serversStatus = {
      lambda,
      content
    }

    return serversStatus
  }

  public async refreshLambdaServerStatus(): Promise<HealthStatus> {
    return HealthStatus.HEALTHY
  }
}
