/* eslint-disable @typescript-eslint/ban-types */
import { EventEmitter } from 'eventemitter3'
import { ServerMessageType, SocketEventType } from './enums'
import logger from './logger'
import { ServerMessage } from './servermessage'

export type SocketType = {
  onmessage: any
  onclose: any
  onopen: any
  readyState: number
  close(code?: number, reason?: string): void
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void
}

export type SocketBuilder = (url: string) => SocketType

/**
 * An abstraction on top of WebSockets to provide fastest
 * possible connection for peers.
 */
export class Socket extends EventEmitter {
  private _disconnected = false
  private _id: string | null = null
  private _messagesQueue: Array<any> = []
  private _wsUrl: string
  private _socket: SocketType
  private _wsPingTimer: any

  constructor(
    secure: any,
    host: string,
    port: number,
    path: string,
    key: string,
    private readonly pingInterval: number = 5000,
    private socketBuilder: SocketBuilder,
    private heartbeatExtras?: () => object
  ) {
    super()

    const wsProtocol = secure ? 'wss://' : 'ws://'

    this._wsUrl = wsProtocol + host + ':' + port + path + 'peerjs?key=' + key
  }

  /** Check in with ID or get one from server. */
  start(id: string | null, token: string): void {
    this._id = id

    if (this._id) {
      this._wsUrl += '&id=' + id
    }

    this._wsUrl += '&token=' + token

    this._startWebSocket()
  }

  /** Start up websocket communications. */
  private _startWebSocket(): void {
    if (this._socket) {
      return
    }

    this._socket = this.socketBuilder(this._wsUrl)

    this._socket.onmessage = (event) => {
      let data: ServerMessage

      try {
        data = JSON.parse(event.data)
        logger.log('Server message received:', data)
      } catch (e) {
        logger.log('Invalid server message', event.data)
        return
      }

      if (data.type === ServerMessageType.AssignedId) {
        this._id = data.payload.id
      }

      this.emit(SocketEventType.Message, data)
    }

    this._socket.onclose = (event) => {
      logger.log('Socket closed.', event)

      this._disconnected = true
      clearTimeout(this._wsPingTimer)

      this.emit(SocketEventType.Disconnected)
    }

    // Take care of the queue of connections if necessary and make sure Peer knows
    // socket is open.
    this._socket.onopen = () => {
      if (this._disconnected) return

      this._sendQueuedMessages()

      logger.log('Socket open')

      this._scheduleHeartbeat()
    }
  }

  private _scheduleHeartbeat(): void {
    this._wsPingTimer = setTimeout(() => {
      this._sendHeartbeat()
    }, this.pingInterval)
  }

  private _sendHeartbeat(): void {
    if (!this._wsOpen()) {
      logger.log(`Cannot send heartbeat, because socket closed`)
      return
    }

    const message = JSON.stringify({
      type: ServerMessageType.Heartbeat,
      payload: this.heartbeatExtras ? this.heartbeatExtras() : {}
    })

    this._socket!.send(message)

    this._scheduleHeartbeat()
  }

  /** Is the websocket currently open? */
  private _wsOpen(): boolean {
    return !!this._socket && this._socket.readyState === 1
  }

  /** Send queued messages. */
  private _sendQueuedMessages(): void {
    //Create copy of queue and clear it,
    //because send method push the message back to queue if smth will go wrong
    const copiedQueue = [...this._messagesQueue]
    this._messagesQueue = []

    for (const message of copiedQueue) {
      this.send(message)
    }
  }

  /** Exposed send for DC & Peer. */
  send(data: any): void {
    if (this._disconnected) {
      return
    }

    // If we didn't get an ID yet, we can't yet send anything so we should queue
    // up these messages.
    if (!this._id) {
      this._messagesQueue.push(data)
      return
    }

    if (!data.type) {
      this.emit(SocketEventType.Error, 'Invalid message')
      return
    }

    if (!this._wsOpen()) {
      this._messagesQueue.push(data)
      return
    }

    const message = JSON.stringify(data)

    this._socket!.send(message)
  }

  close(): void {
    if (!this._disconnected && !!this._socket) {
      this._socket.close()
      this._disconnected = true
      clearTimeout(this._wsPingTimer)
    }
  }
}
