import { mock } from 'ts-mockito'
import { HealthStatus } from '../../../src/apis/status/health'
import PeerHealthStatus from "../../../src/apis/status/PeerHealthStatus"
import { SmartContentClient } from "../../../src/utils/SmartContentClient"

describe('PeerHealthStatus', () => {
  describe('getPeerStatus', () => {
    it('is ready to use when all services are healthy', async () => {
      let contentClientMock: SmartContentClient
      contentClientMock = mock(SmartContentClient)

      const peerHealthStatus = new PeerHealthStatus(contentClientMock, '15m', '3s', 'http://comms-server:9000')
      jest.spyOn(peerHealthStatus['lambdaServerStatus'], 'get').mockResolvedValue(HealthStatus.HEALTHY)
      jest.spyOn(peerHealthStatus['contentServerStatus'], 'get').mockResolvedValue(HealthStatus.HEALTHY)
      jest.spyOn(peerHealthStatus['commsServerStatus'], 'get').mockResolvedValue(HealthStatus.HEALTHY)

      const peerStatus = await peerHealthStatus.getPeerStatus()

      expect(peerStatus.readyToUse).toBe(true)
    })

    it('is not ready to use when some service is down', async () => {
      let contentClientMock: SmartContentClient
      contentClientMock = mock(SmartContentClient)

      const peerHealthStatus = new PeerHealthStatus(contentClientMock, '15m', '3s', 'http://comms-server:9000')
      jest.spyOn(peerHealthStatus['lambdaServerStatus'], 'get').mockResolvedValue(HealthStatus.HEALTHY)
      jest.spyOn(peerHealthStatus['contentServerStatus'], 'get').mockResolvedValue(HealthStatus.UNHEALTHY)
      jest.spyOn(peerHealthStatus['commsServerStatus'], 'get').mockResolvedValue(HealthStatus.HEALTHY)

      const peerStatus = await peerHealthStatus.getPeerStatus()

      expect(peerStatus.readyToUse).toBe(false)
    })
  })
})
