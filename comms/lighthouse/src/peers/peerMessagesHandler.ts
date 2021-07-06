import { IClient } from '../peerjs-server/models/client'
import { AppServices } from '../types'
import { HeartbeatMessage, PeerIncomingMessage, PeerIncomingMessageType } from './protocol/messageTypes'

export type PeerMessagesHandler = (client: IClient, message: PeerIncomingMessage) => any

export function defaultPeerMessagesHandler({ peersService, archipelagoService }: AppServices) {
  return (client: IClient, message: PeerIncomingMessage) => {
    if (client.isAuthenticated()) {
      switch (message.type) {
        case PeerIncomingMessageType.HEARTBEAT:
          handleHeartbeat(message, client)
      }
    }
  }

  function handleHeartbeat(message: HeartbeatMessage, client: IClient) {
    const { position, connectedPeerIds, parcel } = message.payload
    peersService().updateTopology(client.getId(), connectedPeerIds)
    peersService().updatePeerParcel(client.getId(), parcel)
    peersService().updatePeerPosition(client.getId(), position)
    archipelagoService().updatePeerPosition(client.getId(), position)
  }
}
