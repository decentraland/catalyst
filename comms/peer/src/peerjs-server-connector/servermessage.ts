import { PeerOutgoingMessage } from 'comms-protocol/messageTypes'
import { ServerMessageType } from './enums'

export type ServerMessage =
  | {
      type: ServerMessageType
      payload: any
      src: string
      dst: string
    }
  | PeerOutgoingMessage
