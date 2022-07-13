import { Response } from 'express'
import { Bean, Environment, EnvironmentConfig } from '../../../Environment'
import { HealthStatus } from './health'
import PeerHealthStatus from './PeerHealthStatus'

// Method: GET
// Path: /status
export async function statusHandler(res: Response, environment: Environment) {
  res.send({
    version: '1.0',
    currentTime: Date.now(),
    contentServerUrl: environment.getConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS),
    commitHash: environment.getConfig(EnvironmentConfig.COMMIT_HASH),
    catalystVersion: environment.getConfig(EnvironmentConfig.CATALYST_VERSION)
  })
}

// Method: GET
// Path: /health
export async function healthHandler(res: Response, environment: Environment) {
  const peerHealthStatus = new PeerHealthStatus(
    environment.getBean(Bean.SMART_CONTENT_SERVER_CLIENT),
    environment.getConfig(EnvironmentConfig.MAX_SYNCHRONIZATION_TIME),
    environment.getConfig(EnvironmentConfig.MAX_DEPLOYMENT_OBTENTION_TIME)
  )

  peerHealthStatus
    .getPeerStatus()
    .then(($) => {
      const readyToUse = Object.values($).every((state) => state === HealthStatus.HEALTHY)
      if (!readyToUse) {
        res.status(503)
      }
      res.send($)
    })
    .catch((err) => {
      console.error(err)
      res.status(500)
      res.end()
    })
}
