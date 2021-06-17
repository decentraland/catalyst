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

  return (sock as unknown) as MyWebSocket
}

describe('Transmission handler', () => {
  it('should save message in queue when destination client not connected', () => {
    const realm = new Realm()
    const handleTransmission = TransmissionHandler({ realm })

    const clientFrom = createClient({ id: 'id1' })
    const idTo = 'id2'
    realm.setClient(clientFrom, clientFrom.getId())

    handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: idTo })

    expect(realm.getMessageQueueById(idTo)?.getMessages().length).toEqual(1)
  })

  it('should not save LEAVE and EXPIRE messages in queue when destination client not connected', () => {
    const realm = new Realm()
    const handleTransmission = TransmissionHandler({ realm })

    const clientFrom = createClient({ id: 'id1' })
    const idTo = 'id2'
    realm.setClient(clientFrom, clientFrom.getId())

    handleTransmission(clientFrom, { type: MessageType.LEAVE, src: clientFrom.getId(), dst: idTo })
    handleTransmission(clientFrom, { type: MessageType.EXPIRE, src: clientFrom.getId(), dst: idTo })

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

    handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: clientTo.getId() })

    expect(sent).toBeTrue()
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

    handleTransmission(clientFrom, { type: MessageType.OFFER, src: clientFrom.getId(), dst: clientTo.getId() })

    expect(sent).toBeTrue()
  })
})
