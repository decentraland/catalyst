import { Realm } from '../../../../src/peerjs-server/models/realm'
import { CheckBrokenConnections } from '../../../../src/peerjs-server/services/checkBrokenConnections'
import { createClient, wait } from '../../utils'

describe('CheckBrokenConnections', () => {
  it('should remove client after 2 checks', async () => {
    const realm = new Realm()
    const doubleCheckTime = 55 //~ equals to checkBrokenConnections.checkInterval * 2
    const checkBrokenConnections = new CheckBrokenConnections({
      realm,
      config: { alive_timeout: doubleCheckTime },
      checkInterval: 30
    })
    const client = createClient()
    realm.setClient(client, 'id')

    checkBrokenConnections.start()

    await wait(checkBrokenConnections.checkInterval * 2 + 30)

    expect(realm.getClientById('id')).toBeUndefined()

    checkBrokenConnections.stop()
  })

  it('should remove client after 1 ping', async () => {
    const realm = new Realm()
    const doubleCheckTime = 55 //~ equals to checkBrokenConnections.checkInterval * 2
    const checkBrokenConnections = new CheckBrokenConnections({
      realm,
      config: { alive_timeout: doubleCheckTime },
      checkInterval: 30
    })
    const client = createClient()
    realm.setClient(client, 'id')

    checkBrokenConnections.start()

    //set ping after first check
    await wait(checkBrokenConnections.checkInterval)

    client.setLastPing(new Date().getTime())

    await wait(checkBrokenConnections.checkInterval * 2 + 10)

    expect(realm.getClientById('id')).toBeUndefined()

    checkBrokenConnections.stop()
  })
})
