import express from 'express'
import log4js, { Logger } from 'log4js'
import fetch from 'node-fetch'
import { LambdasService, ServerStatus } from '../service/Service'
import { getCommsServerUrl } from '../utils/ControllerUtils'
import { SmartContentClient } from '../utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '../utils/TimeRefreshedDataHolder'

const REFRESH_TIME: string = '1m'

enum HealthStatus {
  HEALTH = 'Healthy',
  LOADED = 'Loaded',
  UNHEALTHY = 'Unhealthy',
  DOWN = 'Down'
}

type Status = ServerStatus & { status: HealthStatus }

export class Controller {
  private static LOGGER: Logger = log4js.getLogger('Controller')
  private contentServerStatus: TimeRefreshedDataHolder<Status>
  private commsServerStatus: TimeRefreshedDataHolder<Status>
  private commsServerUrl: string

  constructor(
    private service: LambdasService,
    private contentService: SmartContentClient,
    externalCommsServerUrl?: string
  ) {
    this.contentServerStatus = new TimeRefreshedDataHolder(() => this.refreshContentServerStatus(), REFRESH_TIME)
    this.commsServerStatus = new TimeRefreshedDataHolder(
      () => this.refreshCommsServerStatus(externalCommsServerUrl),
      REFRESH_TIME
    )
  }

  async getStatus(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /status

    try {
      res.send({
        lambdaStatus: await this.service.getStatus(),
        commsStatus: await this.commsServerStatus.get(),
        contentStatus: await this.contentServerStatus.get()
      })
    } catch (err) {
      res.status(500).send(`There was an error while processing your request: ${err.message}`)
    }
  }

  private async refreshCommsServerStatus(externalCommsServerUrl?: string): Promise<Status> {
    if (!this.commsServerUrl) {
      this.commsServerUrl = await getCommsServerUrl(Controller.LOGGER, externalCommsServerUrl)
    }

    const serverStatus = await (await fetch(this.commsServerUrl + '/status')).json()

    return serverStatus
  }

  private async refreshContentServerStatus(): Promise<Status> {
    const serverStatus = await (await fetch(this.contentService.getContentUrl() + '/status')).json()

    return serverStatus
  }
}
