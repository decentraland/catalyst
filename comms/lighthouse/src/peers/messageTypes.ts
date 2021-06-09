import { PeerConnectionHint, Position } from 'decentraland-catalyst-utils/Positions'
import { MessageType } from 'peerjs-server/dist/src/enums'
import { IMessage } from 'peerjs-server/dist/src/models/message'

// OUTGOING

export type PeerNotificationType =
  | PeerOutgoingMessageType.PEER_LEFT_ROOM
  | PeerOutgoingMessageType.PEER_LEFT_LAYER
  | PeerOutgoingMessageType.PEER_JOINED_LAYER
  | PeerOutgoingMessageType.PEER_JOINED_ROOM

export enum PeerOutgoingMessageType {
  PEER_LEFT_ROOM = 'PEER_LEFT_ROOM',
  PEER_LEFT_LAYER = 'PEER_LEFT_LAYER',
  PEER_JOINED_LAYER = 'PEER_JOINED_LAYER',
  PEER_JOINED_ROOM = 'PEER_JOINED_ROOM',
  PEER_LEFT_ISLAND = 'PEER_LEFT_ISLAND',
  PEER_JOINED_ISLAND = 'PEER_JOINED_ISLAND',
  OPTIMAL_NETWORK_RESPONSE = 'OPTIMAL_NETWORK_RESPONSE',
  CHANGE_ISLAND = 'CHANGE_ISLAND'
}

export type PeerNotificationMessage = {
  type: PeerNotificationType
  payload: Record<string, unknown> // This is too generic, but since we will remove the current notifications because they are related to rooms & layers, we don't need to improve this yet.
}

export type OptimalNetworkResponse = {
  type: PeerOutgoingMessageType.OPTIMAL_NETWORK_RESPONSE
  payload: {
    layerId: string
    optimalConnections: PeerConnectionHint[]
  }
}

export type ChangeIsland = {
  type: PeerOutgoingMessageType.CHANGE_ISLAND
  payload: {
    islandId: string
    peers: string[]
  }
}

export type PeerJoinedIsland = {
  type: PeerOutgoingMessageType.PEER_LEFT_ISLAND
  payload: {
    islandId: string
    peerId: string
  }
}

export type PeerLeftIsland = {
  type: PeerOutgoingMessageType.PEER_JOINED_ISLAND
  payload: {
    islandId: string
    peerId: string
  }
}

export type PeerOutgoingMessageContent =
  | PeerNotificationMessage
  | OptimalNetworkResponse
  | ChangeIsland
  | PeerJoinedIsland
  | PeerLeftIsland

export type PeerOutgoingMessage = Omit<IMessage, 'type'> & PeerOutgoingMessageContent

// INCOMING

export type HeartbeatMessage = {
  type: MessageType.HEARTBEAT
  payload: {
    connectedPeerIds: string[]
    parcel?: [number, number]
    position?: Position
    // These fields will be removed soon
    optimizeNetwork?: boolean
    targetConnections?: number
    maxDistance?: number
  }
}

export type PeerIncomingMessage = HeartbeatMessage
