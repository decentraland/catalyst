import express from 'express'
import log4js, { Logger } from 'log4js'
import fetch from 'node-fetch'
import { LambdasService } from '../service/Service'
import { getCommsServerUrl, HealthStatus, refreshContentServerStatus } from '../utils/ControllerUtils'
import { SmartContentClient } from '../utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '../utils/TimeRefreshedDataHolder'

const REFRESH_TIME: string = '1m'

export class Controller {
  private static LOGGER: Logger = log4js.getLogger('Controller')
  private contentServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private commsServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private lambdaServerStatus: TimeRefreshedDataHolder<HealthStatus>
  private commsServerUrl: string

  constructor(
    private service: LambdasService,
    private contentService: SmartContentClient,
    maxSynchronizationTimeInSeconds: number,
    maxDeploymentObtentionTimeInSeconds: number,
    externalCommsServerUrl?: string
  ) {
    this.contentServerStatus = new TimeRefreshedDataHolder(
      () =>
        refreshContentServerStatus(
          this.contentService,
          maxSynchronizationTimeInSeconds,
          maxDeploymentObtentionTimeInSeconds,
          Controller.LOGGER
        ),
      REFRESH_TIME
    )
    this.lambdaServerStatus = new TimeRefreshedDataHolder(() => this.refreshLambdaServerStatus(), REFRESH_TIME)
    this.commsServerStatus = new TimeRefreshedDataHolder(
      () => this.refreshCommsServerStatus(externalCommsServerUrl),
      REFRESH_TIME
    )
  }

  async getStatus(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /status
    try {
      res.send(await this.service.getStatus())
    } catch (err) {
      res.status(500).send(`There was an error while processing your request: ${err.message}`)
    }
  }

  async getHealth(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /health
    try {
      const serversStatus = {
        lambdaStatus: await (await this.lambdaServerStatus.get()).getName(),
        contentStatus: await (await this.contentServerStatus.get()).getName(),
        commsStatus: await (await this.commsServerStatus.get()).getName()
      }

      res.send(serversStatus)
    } catch (err) {
      res.status(500).send(`There was an error while processing your request: ${err.message}`)
    }
  }

  public async refreshLambdaServerStatus(): Promise<HealthStatus> {
    try {
      await this.service.getStatus()

      return HealthStatus.HEALTHY
    } catch (error) {
      Controller.LOGGER.info('error fetching lambda server status', error)

      return HealthStatus.DOWN
    }
  }

  public async refreshCommsServerStatus(externalCommsServerUrl?: string): Promise<HealthStatus> {
    if (!this.commsServerUrl) {
      this.commsServerUrl = await getCommsServerUrl(Controller.LOGGER, externalCommsServerUrl)
    }

    try {
      await (await fetch(this.commsServerUrl + '/status')).json()

      return HealthStatus.HEALTHY
    } catch (error) {
      Controller.LOGGER.info('error fetching comms server status', error)

      return HealthStatus.DOWN
    }
  }
}
