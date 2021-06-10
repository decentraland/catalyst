import { ServerMessageType } from './enums'
import { PeerOutgoingMessage } from 'comms-protocol/messageTypes'

export type ServerMessage = {
  type: ServerMessageType
  payload: any
  src: string
  dst: string
} | PeerOutgoingMessage
