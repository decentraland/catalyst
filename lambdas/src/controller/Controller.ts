// import { SynchronizationState } from '@katalyst/content/service/synchronization/SynchronizationManager'
import express from 'express'
import log4js, { Logger } from 'log4js'
import fetch from 'node-fetch'
import { LambdasService, ServerStatus } from '../service/Service'
import { SmartContentClient } from '../utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '../utils/TimeRefreshedDataHolder'

const REFRESH_TIME: string = '1m'

const MAX_SYNCRONIZATION_TIME_IN_SECONDS: number = 15 * 60
const MAX_DEPLOYMENT_OBTENTION_TIME_IN_SECONDS: number = 2

enum HealthStatus {
  HEALTHY = 'Healthy',
  LOADED = 'Loaded',
  UNHEALTHY = 'Unhealthy',
  DOWN = 'Down'
}

interface HealthStatusStatus {
  status: string
}

type Status = ServerStatus & HealthStatusStatus

export class Controller {
  private static LOGGER: Logger = log4js.getLogger('Controller')
  private contentServerStatus: TimeRefreshedDataHolder<Partial<Status>>
  // private commsServerStatus: TimeRefreshedDataHolder<Status>
  // private commsServerUrl: string

  constructor(
    private service: LambdasService,
    private contentService: SmartContentClient,
    externalCommsServerUrl?: string
  ) {
    this.contentServerStatus = new TimeRefreshedDataHolder(() => this.refreshContentServerStatus(), REFRESH_TIME)
    // this.commsServerStatus = new TimeRefreshedDataHolder(
    //   () => this.refreshCommsServerStatus(externalCommsServerUrl),
    //   REFRESH_TIME
    // )
  }

  async getStatus(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /status
    try {
      res.send({
        lambdaStatus: await this.service.getStatus(),
        // commsStatus: await this.commsServerStatus.get(),
        contentStatus: await this.contentServerStatus.get()
      })
    } catch (err) {
      res.status(500).send(`There was an error while processing your request: ${err.message}`)
    }
  }

  // private async refreshCommsServerStatus(externalCommsServerUrl?: string): Promise<Status> {
  //   if (!this.commsServerUrl) {
  //     this.commsServerUrl = await getCommsServerUrl(Controller.LOGGER, externalCommsServerUrl)
  //   }

  //   const serverStatus = await (await fetch(this.commsServerUrl + '/status')).json()

  //   return serverStatus
  // }

  private async refreshContentServerStatus(): Promise<Partial<Status>> {
    let healthStatus: HealthStatus
    const serverStatus = {}
    Controller.LOGGER.info('EMPIEZA')
    try {
      const fetchContentServerStatus = (await fetch((await this.contentService.getClientUrl()) + '/status')).json()
      const [serverStatus, obtainDeploymentTime] = await Promise.all([
        await fetchContentServerStatus,
        await this.timeContentDeployments()
      ])
      const sincrionizationDiffInSeconds =
        new Date(serverStatus.currentTime - serverStatus.synchronizationStatus.lastSyncWithOtherServers).getTime() /
        1000
      const hasOldInformation = sincrionizationDiffInSeconds > MAX_SYNCRONIZATION_TIME_IN_SECONDS

      const obtainDeploymentTimeInSeconds = obtainDeploymentTime / 1000
      const obtainDeploymentTimeIsTooLong = obtainDeploymentTimeInSeconds > MAX_DEPLOYMENT_OBTENTION_TIME_IN_SECONDS
      // const isBootstrapping = serverStatus.synchronizationStatus === SynchronizationState.BOOTSTRAPPING;

      if (hasOldInformation || obtainDeploymentTimeIsTooLong) {
        healthStatus = HealthStatus.UNHEALTHY
      } else {
        healthStatus = HealthStatus.HEALTHY
      }

      //   HealthStatus.UNHEALTHY :
      // hasOldInformation?
      return { ...fetchContentServerStatus, healthStatus }
    } catch (error) {
      Controller.LOGGER.info('error', error)
      healthStatus = HealthStatus.UNHEALTHY
    }

    return { ...serverStatus, healthStatus } as Partial<Status>
  }

  private async timeContentDeployments(): Promise<number> {
    const startingTime = Date.now()
    await (await fetch((await this.contentService.getClientUrl()) + '/deployments?limit=1')).json()
    const endingTime = Date.now()

    return endingTime - startingTime
  }
}
