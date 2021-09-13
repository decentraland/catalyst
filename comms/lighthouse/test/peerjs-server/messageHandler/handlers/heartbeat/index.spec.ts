import { HeartbeatHandler } from '../../../../../src/peerjs-server/messageHandler/handlers'
import { createClient } from '../../../utils'

describe('Heartbeat handler', () => {
  it('should update last ping time', () => {
    const client = createClient({})
    client.setLastPing(0)

    const nowTime = new Date().getTime()

    HeartbeatHandler(client).catch(console.error)

    expect(client.getLastPing() - nowTime).toBeLessThanOrEqual(1000)
  })
})
