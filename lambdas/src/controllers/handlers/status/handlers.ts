import { Response } from 'express'
import { HealthStatus } from './health'
import PeerHealthStatus from './PeerHealthStatus'
import { Bean, Environment } from '../../../Environment'
import { GlobalContext } from '../../../types'

// Method: GET
// Path: /status
export async function statusHandler(res: Response, globalContext: GlobalContext) {
  const config = globalContext.components.config
  res.send({
    version: '1.0',
    currentTime: Date.now(),
    contentServerUrl: config.getString('CONTENT_SERVER_ADDRESS'),
    commitHash: config.getString('COMMIT_HASH'),
    catalystVersion: config.getString('CATALYST_VERSION')
  })
}

// Method: GET
// Path: /health
export async function healthHandler(res: Response, env: Environment, globalContext: GlobalContext) {
  const config = globalContext.components.config
  const maxSynchronizationTime = (await config.getString('MAX_SYNCHRONIZATION_TIME')) ?? ''
  const maxDeploymentObtentionTime = (await config.getString('MAX_DEPLOYMENT_OBTENTION_TIME')) ?? ''
  const commsServerAddress = (await config.getString('COMMS_SERVER_ADDRESS')) ?? ''

  const peerHealthStatus = new PeerHealthStatus(
    env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT),
    maxSynchronizationTime,
    maxDeploymentObtentionTime,
    commsServerAddress
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
