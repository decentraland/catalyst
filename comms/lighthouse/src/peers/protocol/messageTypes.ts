import { Position3D } from '@dcl/catalyst-node-commons'

// OUTGOING
export enum PeerOutgoingMessageType {
  PEER_LEFT_ISLAND = 'PEER_LEFT_ISLAND',
  PEER_JOINED_ISLAND = 'PEER_JOINED_ISLAND',
  OPTIMAL_NETWORK_RESPONSE = 'OPTIMAL_NETWORK_RESPONSE',
  CHANGE_ISLAND = 'CHANGE_ISLAND'
}

export type PeerWithPosition = {
  id: string
  position: [number, number, number]
}

export type ChangeIsland = {
  type: PeerOutgoingMessageType.CHANGE_ISLAND
  payload: {
    islandId: string
    peers: PeerWithPosition[]
  }
}

export type PeerJoinedIsland = {
  type: PeerOutgoingMessageType.PEER_LEFT_ISLAND
  payload: {
    islandId: string
    peer: PeerWithPosition
  }
}

export type PeerLeftIsland = {
  type: PeerOutgoingMessageType.PEER_JOINED_ISLAND
  payload: {
    islandId: string
    peer: PeerWithPosition
  }
}

export type PeerOutgoingMessageContent = ChangeIsland | PeerJoinedIsland | PeerLeftIsland

export type PeerOutgoingMessage = { readonly src: string; readonly dst: string } & PeerOutgoingMessageContent

// INCOMING
export enum PeerIncomingMessageType {
  HEARTBEAT = 'HEARTBEAT'
}

export type HeartbeatMessage = {
  type: PeerIncomingMessageType.HEARTBEAT
  payload: {
    connectedPeerIds: string[]
    parcel?: [number, number]
    position?: Position3D
    preferedIslandId?: string
  }
}

export type PeerIncomingMessage = HeartbeatMessage
