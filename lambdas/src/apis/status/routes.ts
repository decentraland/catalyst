import PeerHealthStatus from '@katalyst/lambdas/apis/status/PeerHealthStatus'
import { Bean, Environment, EnvironmentConfig } from '@katalyst/lambdas/Environment'
import { Request, Response, Router } from 'express'

export default (environment: Environment): Router => {
  const router = Router()
  const peerHealthStatus = new PeerHealthStatus(
    environment.getBean(Bean.SMART_CONTENT_SERVER_CLIENT),
    environment.getConfig(EnvironmentConfig.MAX_SYNCHRONIZATION_TIME),
    environment.getConfig(EnvironmentConfig.MAX_DEPLOYMENT_OBTENTION_TIME),
    environment.getConfig(EnvironmentConfig.COMMS_SERVER_ADDRESS)
  )

  router.get('/status', (req: Request, res: Response) => {
    // Method: GET
    // Path: /status
    res.send({
      version: '1.0',
      currentTime: Date.now(),
      contentServerUrl: environment.getConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS),
      commitHash: environment.getConfig(EnvironmentConfig.COMMIT_HASH),
      catalystVersion: environment.getConfig(EnvironmentConfig.CATALYST_VERSION)
    })
  })

  router.get('/health', async (req: Request, res: Response) => {
    // Method: GET
    // Path: /health

    res.send(await peerHealthStatus.getPeerStatus())
  })

  return router
}
