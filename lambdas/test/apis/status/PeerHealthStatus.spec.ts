import fetch from 'node-fetch'
import { HealthStatus } from '../../../src/apis/status/health'
import PeerHealthStatus from '../../../src/apis/status/PeerHealthStatus'
import { Environment, EnvironmentConfig } from "../../../src/Environment"
import { Server } from "../../../src/Server"
import * as Commons from "../../../src/utils/commons"

describe('PeerHealthStatus', () => {
  describe('getPeerStatus', () => {
    let server: Server
    let baseUrl: string

    beforeAll(async () => {
      jest.spyOn(Commons, 'getCommsServerUrl').mockResolvedValue('')
      process.env.CONTENT_SERVER_ADDRESS = ''
      const env = await Environment.getInstance()
      baseUrl = `http://localhost:${env.getConfig(EnvironmentConfig.SERVER_PORT)}`

      server = new Server(env)
      await server.start()
    })

    afterAll(async () => {
      await server.stop()
    })

   it('is ready to use when all services are healthy', async () => {
      jest.spyOn(PeerHealthStatus.prototype, 'getPeerStatus').mockResolvedValue({
        comms: HealthStatus.HEALTHY,
        content: HealthStatus.HEALTHY,
        lambda: HealthStatus.HEALTHY,
      })

      const response = await fetch(`${baseUrl}/health`)
      expect(response.status).toBe(200)

      jest.spyOn(PeerHealthStatus.prototype, 'getPeerStatus').mockRestore()
    })

    it('is not available when some service is unhealthy', async () => {
      jest.spyOn(PeerHealthStatus.prototype, 'getPeerStatus').mockResolvedValue({
        comms: HealthStatus.HEALTHY,
        content: HealthStatus.UNHEALTHY,
        lambda: HealthStatus.HEALTHY,
      })


      const response = await fetch(`${baseUrl}/health`)
      expect(response.status).toBe(503)

      jest.spyOn(PeerHealthStatus.prototype, 'getPeerStatus').mockRestore()
    })
  })
})
