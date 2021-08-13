import { MessageType } from '../../../enums'
import { IClient } from '../../../models/client'
import { IMessage } from '../../../models/message'
import { IRealm } from '../../../models/realm'

export const TransmissionHandler = ({
  realm,
  transmissionFilter
}: {
  realm: IRealm
  transmissionFilter?: (src: string, dst: string, message: IMessage) => Promise<boolean>
}): ((client: IClient | undefined, message: IMessage) => Promise<boolean>) => {
  const handle = async (client: IClient | undefined, message: IMessage) => {
    if (!client?.isAuthenticated()) {
      // We ignore transmission messages for peers that are not authenticated
      return true
    }

    const type = message.type
    const srcId = message.src
    const dstId = message.dst

    if (transmissionFilter && !(await transmissionFilter(srcId, dstId, message))) {
      // We ignore transmission messages that are filtered
      return true
    }

    const destinationClient = realm.getClientById(dstId)

    // User is connected!
    if (destinationClient) {
      const socket = destinationClient.getSocket()
      try {
        if (socket) {
          const data = JSON.stringify(message)

          socket.send(data)
        } else {
          // Neither socket no res available. Peer dead?
          throw new Error('Peer dead')
        }
      } catch (e) {
        // This happens when a peer disconnects without closing connections and
        // the associated WebSocket has not closed.
        // Tell other side to stop trying.
        if (socket) {
          socket.close()
        } else {
          realm.removeClientById(destinationClient.getId())
        }

        await handle(client, {
          type: MessageType.LEAVE,
          src: dstId,
          dst: srcId
        })
      }
    } else {
      // Wait for this client to connect/reconnect (XHR) for important
      // messages.
      const ignoredTypes = [MessageType.LEAVE, MessageType.EXPIRE]

      if (!ignoredTypes.includes(type) && dstId) {
        realm.addMessageToQueue(dstId, message)
      } else if (type === MessageType.LEAVE && !dstId) {
        realm.removeClientById(srcId)
      } else {
        // Unavailable destination specified with message LEAVE or EXPIRE
        // Ignore
      }
    }

    return true
  }

  return handle
}
