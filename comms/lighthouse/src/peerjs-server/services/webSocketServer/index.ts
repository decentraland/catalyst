import EventEmitter from 'events'
import { IncomingMessage } from 'http'
import url from 'url'
import WebSocketLib from 'ws'
import { IConfig } from '../../config'
import { Errors, IdType, MessageType } from '../../enums'
import { Client, IClient } from '../../models/client'
import { IRealm } from '../../models/realm'
import { MyWebSocket } from './webSocket'

export interface IWebSocketServer extends EventEmitter {
  readonly path: string
}

interface IAuthParams {
  id?: string
  token?: string
  key?: string
}

type CustomConfig = Pick<IConfig, 'path' | 'key' | 'concurrent_limit' | 'idGenerator' | 'maxIdIterations'>

const WS_PATH = 'peerjs'

export class WebSocketServer extends EventEmitter implements IWebSocketServer {
  public readonly path: string
  private readonly realm: IRealm
  private readonly config: CustomConfig
  public readonly socketServer: WebSocketLib.Server

  constructor({ server, realm, config }: { server: any; realm: IRealm; config: CustomConfig }) {
    super()

    this.setMaxListeners(0)

    this.realm = realm
    this.config = config

    const path = this.config.path
    this.path = `${path}${path.endsWith('/') ? '' : '/'}${WS_PATH}`

    this.socketServer = new WebSocketLib.Server({ path: this.path, server })

    this.socketServer.on('connection', (socket: MyWebSocket, req) => this._onSocketConnection(socket, req))
    this.socketServer.on('error', (error: Error) => this._onSocketError(error))
  }

  private _onSocketConnection(socket: MyWebSocket, req: IncomingMessage): void {
    const { query = {} } = url.parse(req.url!, true)

    const { token, key }: IAuthParams = query
    const { id, idType } =
      typeof query.id === 'string'
        ? { id: query.id as string, idType: IdType.SELF_ASSIGNED }
        : { id: this.getFreeId(this.realm), idType: IdType.SERVER_ASSIGNED }

    if (!id) {
      return this._sendErrorAndClose(socket, Errors.NO_AVAILABLE_ID_FOUND)
    }

    if (!token || !key) {
      return this._sendErrorAndClose(socket, Errors.INVALID_WS_PARAMETERS)
    }

    if (key !== this.config.key) {
      return this._sendErrorAndClose(socket, Errors.INVALID_KEY)
    }

    const client = this.realm.getClientById(id)

    if (client) {
      if (token !== client.getToken()) {
        // ID-taken, invalid token
        socket.send(
          JSON.stringify({
            type: MessageType.ID_TAKEN,
            payload: { msg: 'ID is taken' }
          })
        )

        return socket.close()
      }

      return this._configureWS(socket, client)
    }

    if (idType === IdType.SERVER_ASSIGNED) {
      socket.send(
        JSON.stringify({
          type: MessageType.ASSIGNED_ID,
          payload: { id }
        })
      )
    }

    this._registerClient({ socket, id, token, idType })
  }

  private getFreeId(realm: IRealm): string | undefined {
    let id = this.config.idGenerator()
    let currentIterations = 0
    while (realm.hasClient(id)) {
      currentIterations++
      if (currentIterations > this.config.maxIdIterations) {
        return
      }

      id = this.config.idGenerator()
    }

    return id
  }

  private _onSocketError(error: Error): void {
    // handle error
    this.emit('error', error)
  }

  private generateRandomMessage() {
    return Math.random().toString(36).substring(2)
  }

  private _registerClient({
    socket,
    id,
    token,
    idType
  }: {
    socket: MyWebSocket
    id: string
    token: string
    idType: IdType
  }): void {
    // Check concurrent limit
    const clientsCount = this.realm.getClientsIds().length

    if (clientsCount >= this.config.concurrent_limit) {
      return this._sendErrorAndClose(socket, Errors.CONNECTION_LIMIT_EXCEED)
    }

    const payload = this.generateRandomMessage()

    const newClient: IClient = new Client({ id, token, msg: payload, idType })
    this.realm.setClient(newClient, id)
    socket.send(JSON.stringify({ type: MessageType.OPEN, payload }))

    this._configureWS(socket, newClient)
  }

  private _configureWS(socket: MyWebSocket, client: IClient): void {
    client.setSocket(socket)

    // Cleanup after a socket closes.
    socket.on('close', () => {
      if (client.getSocket() === socket) {
        this.realm.removeClientById(client.getId())
        this.emit('close', client)
      }
    })

    // Handle messages from peers.
    socket.on('message', (data: WebSocketLib.Data) => {
      try {
        const message = JSON.parse(data as string)

        message.src = client.getId()

        this.emit('message', client, message)
      } catch (e) {
        this.emit('error', e)
      }
    })

    this.emit('connection', client)
  }

  private _sendErrorAndClose(socket: MyWebSocket, msg: Errors): void {
    socket.send(
      JSON.stringify({
        type: MessageType.ERROR,
        payload: { msg }
      })
    )

    socket.close()
  }
}
