import log4js, { Logger } from 'log4js'
import fetch from 'node-fetch'
import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { getCommsServerUrl } from '../utils/commons'
import { HealthStatus, refreshContentServerStatus } from '../utils/health'
import { TimeRefreshedDataHolder } from '../utils/TimeRefreshedDataHolder'
import { LambdasService, ServerStatus } from './Service'

const REFRESH_TIME: string = '1m'

export class ServiceImpl implements LambdasService {
  private static LOGGER: Logger = log4js.getLogger('ServiceImpl')

  private contentServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private commsServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private lambdaServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private commsServerUrl: string

  constructor(private readonly env: Environment) {
    this.contentServerStatus = new TimeRefreshedDataHolder(
      () =>
        refreshContentServerStatus(
          env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT),
          env.getConfig(EnvironmentConfig.MAX_SYNCHRONIZATION_TIME_IN_SECONDS),
          env.getConfig(EnvironmentConfig.MAX_DEPLOYMENT_OBTENTION_TIME_IN_SECONDS),
          ServiceImpl.LOGGER
        ),
      REFRESH_TIME
    )
    this.lambdaServerStatus = new TimeRefreshedDataHolder(() => this.refreshLambdaServerStatus(), REFRESH_TIME)
    this.commsServerStatus = new TimeRefreshedDataHolder(() => this.refreshCommsServerStatus(), REFRESH_TIME)
  }

  getStatus(): Promise<ServerStatus> {
    return Promise.resolve({
      version: '1.0',
      currentTime: Date.now(),
      contentServerUrl: this.env.getConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS),
      commitHash: this.env.getConfig(EnvironmentConfig.COMMIT_HASH),
      catalystVersion: this.env.getConfig(EnvironmentConfig.CATALYST_VERSION)
    })
  }

  async getHealth(): Promise<Record<string, HealthStatus>> {
    const serversStatus = {
      lambdaStatus: (await this.lambdaServerStatus.get()).getName(),
      contentStatus: (await this.contentServerStatus.get()).getName(),
      commsStatus: (await this.commsServerStatus.get()).getName()
    }

    return serversStatus
  }

  public async refreshLambdaServerStatus(): Promise<HealthStatus> {
    try {
      await this.getStatus()

      return HealthStatus.HEALTHY
    } catch (error) {
      ServiceImpl.LOGGER.info('error fetching lambda server status', error)

      return HealthStatus.DOWN
    }
  }

  public async refreshCommsServerStatus(): Promise<HealthStatus> {
    if (!this.commsServerUrl) {
      this.commsServerUrl = await getCommsServerUrl(
        ServiceImpl.LOGGER,
        this.env.getConfig(EnvironmentConfig.COMMS_SERVER_ADDRESS)
      )
    }

    try {
      await (await fetch(this.commsServerUrl + '/status')).json()

      return HealthStatus.HEALTHY
    } catch (error) {
      ServiceImpl.LOGGER.info('error fetching comms server status', error)

      return HealthStatus.DOWN
    }
  }
}
