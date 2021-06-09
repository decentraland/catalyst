import { Position } from 'decentraland-catalyst-utils/Positions'
import { MessageType } from 'peerjs-server/dist/src/enums'
import { IMessage } from 'peerjs-server/dist/src/models/message'

// OUTGOING

export type PeerOutgoingMessage = Omit<IMessage, 'type'>

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
