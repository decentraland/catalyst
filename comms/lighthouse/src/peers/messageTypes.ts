import { Position } from 'decentraland-catalyst-utils/Positions'
import { MessageType } from 'peerjs-server/dist/src/enums'
import { IMessage } from 'peerjs-server/dist/src/models/message'

// OUTGOING

export enum PeerOutgoingMessageType {
  PEER_LEFT_ISLAND = 'PEER_LEFT_ISLAND',
  PEER_JOINED_ISLAND = 'PEER_JOINED_ISLAND',
  OPTIMAL_NETWORK_RESPONSE = 'OPTIMAL_NETWORK_RESPONSE',
  CHANGE_ISLAND = 'CHANGE_ISLAND'
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

export type PeerOutgoingMessageContent = ChangeIsland | PeerJoinedIsland | PeerLeftIsland

export type PeerOutgoingMessage = Omit<IMessage, 'type'> & PeerOutgoingMessageContent

// INCOMING

export type HeartbeatMessage = {
  type: MessageType.HEARTBEAT
  payload: {
    connectedPeerIds: string[]
    parcel?: [number, number]
    position?: Position
  }
}

export type PeerIncomingMessage = HeartbeatMessage
