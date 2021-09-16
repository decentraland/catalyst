import { MessageType } from '../../../../../src/peerjs-server/enums'
import { TransmissionHandler } from '../../../../../src/peerjs-server/messageHandler/handlers'
import { Realm } from '../../../../../src/peerjs-server/models/realm'
import { MyWebSocket } from '../../../../../src/peerjs-server/services/webSocketServer/webSocket'
import { createClient } from '../../../utils'

const createFakeSocket = (): MyWebSocket => {
  /* eslint-disable @typescript-eslint/no-empty-function */
  const sock = {
    send: (): void => {},
    close: (): void => {},
    on: (): void => {}
  }
  /* eslint-enable @typescript-eslint/no-empty-function */
  return sock as any
}

describe('Transmission handler', () => {
  it('should save message in queue when destination client not connected', () => {
    const realm = new Realm()
    const handleTransmission = TransmissionHandler({ realm })

    const clientFrom = createClient({ id: 'id1' })
    const idTo = 'id2'
    realm.setClient(clientFrom, clientFrom.getId())

    handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: idTo }).catch(console.error)

    expect(realm.getMessageQueueById(idTo)?.getMessages().length).toEqual(1)
  })

  it('should not save LEAVE and EXPIRE messages in queue when destination client not connected', () => {
    const realm = new Realm()
    const handleTransmission = TransmissionHandler({ realm })

    const clientFrom = createClient({ id: 'id1' })
    const idTo = 'id2'
    realm.setClient(clientFrom, clientFrom.getId())

    handleTransmission(clientFrom, { type: MessageType.LEAVE, src: clientFrom.getId(), dst: idTo }).catch(console.error)
    handleTransmission(clientFrom, { type: MessageType.EXPIRE, src: clientFrom.getId(), dst: idTo }).catch(
      console.error
    )

    expect(realm.getMessageQueueById(idTo)).toBeUndefined()
  })

  it('should send message to destination client when destination client connected', () => {
    const realm = new Realm()
    const handleTransmission = TransmissionHandler({ realm })

    const clientFrom = createClient({ id: 'id1' })
    const clientTo = createClient({ id: 'id2' })
    const socketTo = createFakeSocket()
    clientTo.setSocket(socketTo)
    realm.setClient(clientTo, clientTo.getId())

    let sent = false
    socketTo.send = (): void => {
      sent = true
    }

    handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: clientTo.getId() }).catch(
      console.error
    )

    expect(sent).toBe(true)
  })

  it('should send LEAVE message to source client when sending to destination client failed', () => {
    const realm = new Realm()
    const handleTransmission = TransmissionHandler({ realm })

    const clientFrom = createClient({ id: 'id1' })
    const clientTo = createClient({ id: 'id2' })
    const socketFrom = createFakeSocket()
    const socketTo = createFakeSocket()
    clientFrom.setSocket(socketFrom)
    clientTo.setSocket(socketTo)
    realm.setClient(clientFrom, clientFrom.getId())
    realm.setClient(clientTo, clientTo.getId())

    let sent = false
    socketFrom.send = (data: string): void => {
      if (JSON.parse(data)?.type === MessageType.LEAVE) {
        sent = true
      }
    }

    socketTo.send = (): void => {
      throw Error()
    }

    handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: clientTo.getId() }).catch(
      console.error
    )

    expect(sent).toBe(true)
  })

  it('should filter a transmission message when a filter is provided', async () => {
    const realm = new Realm()
    const filter = async (src: string, dst: string) => src == 'id1' && dst == 'id2'

    const handleTransmission = TransmissionHandler({ realm, transmissionFilter: filter })

    const clientFrom = createClient({ id: 'id1' })
    const clientTo = createClient({ id: 'id2' })
    const socketTo = createFakeSocket()
    clientTo.setSocket(socketTo)
    realm.setClient(clientFrom, clientFrom.getId())
    realm.setClient(clientTo, clientTo.getId())

    let sent = false
    socketTo.send = async (data: string) => {
      const { src, dst } = JSON.parse(data)
      if (await filter(src, dst)) {
        sent = true
      } else {
        throw Error('This message should have been filtered: ' + data)
      }
    }

    await handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: clientTo.getId() })

    expect(sent).toBe(true)

    await handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: 'asd' })
  })
})
