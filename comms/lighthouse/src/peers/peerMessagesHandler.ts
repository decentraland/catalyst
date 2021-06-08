import { MessageType } from 'peerjs-server/dist/src/enums'
import { IClient } from 'peerjs-server/dist/src/models/client'
import { AppServices } from '../types'
import { HeartbeatMessage, PeerIncomingMessage, PeerOutgoingMessageType } from './messageTypes'

export type PeerMessagesHandler = (client: IClient, message: PeerIncomingMessage) => any

export function defaultPeerMessagesHandler({ peersService, archipelagoService, layersService }: AppServices) {
  return (client: IClient, message: PeerIncomingMessage) => {
    if (client.isAuthenticated()) {
      switch (message.type) {
        case MessageType.HEARTBEAT:
          handleHeartbeat(message, client)
      }
    }
  }

  function handleHeartbeat(message: HeartbeatMessage, client: IClient) {
    const { position, connectedPeerIds, parcel, optimizeNetwork, targetConnections, maxDistance } = message.payload
    peersService().updateTopology(client.getId(), connectedPeerIds)
    peersService().updatePeerParcel(client.getId(), parcel)
    peersService().updatePeerPosition(client.getId(), position)
    archipelagoService().updatePeerPosition(client.getId(), position)

    if (optimizeNetwork) {
      const optimalConnectionsResult = layersService().getOptimalConnectionsFor(
        client.getId(),
        targetConnections!,
        maxDistance!
      )

      peersService().sendMessageToPeer(client.getId(), {
        type: PeerOutgoingMessageType.OPTIMAL_NETWORK_RESPONSE,
        payload: optimalConnectionsResult
      })
    }
  }
}
