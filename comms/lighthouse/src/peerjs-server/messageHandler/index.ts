import { IConfig } from '../config/index'
import { MessageType } from '../enums'
import { IClient } from '../models/client'
import { IMessage } from '../models/message'
import { IRealm } from '../models/realm'
import { Handler } from './handler'
import { HeartbeatHandler, TransmissionHandler } from './handlers'
import { HandlersRegistry, IHandlersRegistry } from './handlersRegistry'

export interface IMessageHandler {
  handle(client: IClient | undefined, message: IMessage): boolean | Promise<boolean>
}

export class MessageHandler implements IMessageHandler {
  constructor(
    realm: IRealm,
    config: IConfig,
    private readonly handlersRegistry: IHandlersRegistry = new HandlersRegistry()
  ) {
    const transmissionHandler: Handler = TransmissionHandler({ realm, transmissionFilter: config.transmissionFilter })
    const heartbeatHandler: Handler = HeartbeatHandler

    const handleTransmission: Handler = (client: IClient | undefined, { type, src, dst, payload }: IMessage) => {
      return transmissionHandler(client, {
        type,
        src,
        dst,
        payload
      })
    }

    const handleHeartbeat = (client: IClient | undefined, message: IMessage) => heartbeatHandler(client, message)

    const handleValidation = async (client: IClient | undefined, message: IMessage) => {
      const result = await config.authHandler(client, message)
      const socket = client?.getSocket()

      try {
        if (socket) {
          if (result) {
            client!.setAuthenticated(true)
          }

          const data = JSON.stringify({ type: result ? MessageType.VALIDATION_OK : MessageType.VALIDATION_NOK })

          socket.send(data)

          if (!result) {
            socket.close()
          }
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
          realm.removeClientById(client!.getId())
        }

        await this.handle(client, {
          type: MessageType.LEAVE,
          src: client!.getId(),
          dst: client!.getId()
        })
      }

      return true
    }

    this.handlersRegistry.registerHandler(MessageType.HEARTBEAT, handleHeartbeat)
    this.handlersRegistry.registerHandler(MessageType.VALIDATION, handleValidation)
    this.handlersRegistry.registerHandler(MessageType.OFFER, handleTransmission)
    this.handlersRegistry.registerHandler(MessageType.ANSWER, handleTransmission)
    this.handlersRegistry.registerHandler(MessageType.REJECT, handleTransmission)
    this.handlersRegistry.registerHandler(MessageType.CANDIDATE, handleTransmission)
    this.handlersRegistry.registerHandler(MessageType.LEAVE, handleTransmission)
    this.handlersRegistry.registerHandler(MessageType.EXPIRE, handleTransmission)
  }

  public handle(client: IClient | undefined, message: IMessage): Promise<boolean> {
    return this.handlersRegistry.handle(client, message)
  }
}
