import { PeerOutgoingMessage } from 'comms-protocol/messageTypes'
import EventEmitter from 'eventemitter3'
import { future } from 'fp-future'
import SimplePeer, { SignalData } from 'simple-peer'
import { PeerSignals, PEER_CONSTANTS } from './constants'
import { PeerEventType, ServerMessageType } from './peerjs-server-connector/enums'
import { HandshakeData, PeerJSServerConnection } from './peerjs-server-connector/peerjsserverconnection'
import { ServerMessage } from './peerjs-server-connector/servermessage'
import { SocketBuilder } from './peerjs-server-connector/socket'
import { connectionIdFor, util } from './peerjs-server-connector/util'
import { TimeKeeper } from './TimeKeeper'
import { ConnectedPeerData, LogLevel, ValidationResult, WebRTCProvider } from './types'

type Logger = {
  log: (level: LogLevel, ...entries: any[]) => any
}

type OptionalConfig = {
  logger: Logger
  heartbeatInterval: number
  connectionToken: string
  heartbeatExtras: () => Record<string, any>
  isReadyToEmitSignals: () => boolean
  handshakePayloadExtras: () => Record<string, any>
  handshakeValidator: (payload: HandshakeData, peerId: string) => ValidationResult
  receivedOfferValidator: (payload: HandshakeData, peerId: string) => ValidationResult
  serverMessageHandler: (message: PeerOutgoingMessage) => void
  rtcConnectionConfig: Record<string, any>
  oldConnectionsTimeout: number
  peerConnectTimeout: number
}

type Config = {
  packetHandler: (data: Uint8Array, peerId: string) => void
  peerId?: string
  authHandler?: (msg: string) => Promise<string>
  socketBuilder?: SocketBuilder
  wrtc?: WebRTCProvider
}

export type PeerWebRTCConfig = Partial<OptionalConfig> & Config

export enum PeerWebRTCEvent {
  ConnectionRequestRejected = 'ConnectionRequestRejected',
  PeerConnectionLost = 'PeerConnectionLost',
  PeerConnectionEstablished = 'PeerConnectionEstablished',
  ServerConnectionError = 'ServerConnectionError'
}

export class PeerWebRTCHandler extends EventEmitter<PeerWebRTCEvent> {
  private connectedPeers: Record<string, ConnectedPeerData> = {}
  private peerConnectionPromises: Record<string, { resolve: () => void; reject: () => void }[]> = {}
  private disposed: boolean = false

  private peerJsConnection: PeerJSServerConnection

  public config: OptionalConfig & Config

  private _peerId: string | undefined
  private _configuredId: string | undefined

  private disconnectionCause: Error | undefined

  constructor(providedConfig: PeerWebRTCConfig) {
    super()

    this._configuredId = providedConfig.peerId
    this._peerId = this._configuredId

    this.config = {
      wrtc: providedConfig.wrtc,
      logger: providedConfig.logger ?? console,
      heartbeatInterval: providedConfig.heartbeatInterval ?? PEER_CONSTANTS.DEFAULT_HEARTBEAT_INTERVAL,
      connectionToken: providedConfig.connectionToken ?? util.randomToken(),
      heartbeatExtras: providedConfig.heartbeatExtras ?? (() => ({})),
      isReadyToEmitSignals: providedConfig.isReadyToEmitSignals ?? (() => true),
      handshakePayloadExtras: providedConfig.handshakePayloadExtras ?? (() => ({})),
      rtcConnectionConfig: providedConfig.rtcConnectionConfig ?? {},
      authHandler: providedConfig.authHandler,
      serverMessageHandler: providedConfig.serverMessageHandler ?? (() => {}),
      packetHandler: providedConfig.packetHandler,
      socketBuilder: providedConfig.socketBuilder,
      peerConnectTimeout: providedConfig.peerConnectTimeout ?? PEER_CONSTANTS.DEFAULT_PEER_CONNECT_TIMEOUT,
      oldConnectionsTimeout:
        providedConfig.oldConnectionsTimeout ??
        (providedConfig.peerConnectTimeout ?? PEER_CONSTANTS.DEFAULT_PEER_CONNECT_TIMEOUT) * 10,
      handshakeValidator:
        providedConfig.handshakeValidator ??
        (() => ({
          ok: true
        })),
      receivedOfferValidator:
        providedConfig.receivedOfferValidator ??
        (() => ({
          ok: true
        }))
    }
  }

  /**
   * This will try to obtain the peer's id.
   * If it is not assigned yet, then it will throw an error.
   */
  peerId() {
    if (this._peerId) {
      return this._peerId
    } else {
      throw new Error("This peer doesn't have an id yet")
    }
  }

  maybePeerId() {
    return this._peerId
  }

  setPeerServerUrl(peerServerUrl: string) {
    this.peerJsConnection?.removeAllListeners()
    this.peerJsConnection?.disconnect().catch((e) => this.log(LogLevel.DEBUG, 'Error while disconnecting ', e))

    const url = new URL(peerServerUrl)
    const secure = url.protocol === 'https:'
    this.peerJsConnection = new PeerJSServerConnection(this, this._configuredId, {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : secure ? 443 : 80,
      path: url.pathname,
      secure,
      pingInterval: this.config.heartbeatInterval,
      token: this.config.connectionToken,
      authHandler: this.config.authHandler,
      heartbeatExtras: () => ({
        ...this.buildTopologyInfo(),
        ...this.config.heartbeatExtras()
      }),
      ...(this.config.socketBuilder ? { socketBuilder: this.config.socketBuilder } : {})
    })

    this.peerJsConnection.on(PeerEventType.AssignedId, (id) => (this._peerId = id))
    this.peerJsConnection.on(PeerEventType.Error, (err) => this.emit(PeerWebRTCEvent.ServerConnectionError, err))
  }

  public cleanConnections() {
    Object.keys(this.connectedPeers).forEach((it) => this.disconnectFrom(it))
  }

  public disconnectFrom(peerId: string, removeListener: boolean = true) {
    if (this.connectedPeers[peerId]) {
      this.log(LogLevel.INFO, 'Disconnecting from ' + peerId)
      //We remove close listeners since we are going to destroy the connection anyway. No need to handle the events.
      if (removeListener) this.connectedPeers[peerId].connection.removeAllListeners('close')
      this.connectedPeers[peerId].connection.destroy()
      delete this.connectedPeers[peerId]
    } else {
      this.log(LogLevel.INFO, '[PEER] Already not connected to peer ' + peerId)
    }
  }

  private buildTopologyInfo() {
    return { connectedPeerIds: this.fullyConnectedPeerIds() }
  }

  connectedCount() {
    return this.fullyConnectedPeerIds().length
  }

  fullyConnectedPeerIds() {
    return Object.keys(this.connectedPeers).filter((it) => this.isConnectedTo(it))
  }

  connectedPeerIds() {
    return Object.keys(this.connectedPeers)
  }

  public isConnectedTo(peerId: string): boolean {
    return (
      //The `connected` property is not typed but it seems to be public
      this.connectedPeers[peerId] && (this.connectedPeers[peerId].connection as any).connected
    )
  }

  private handleDisconnection(peerData: ConnectedPeerData) {
    this.log(
      LogLevel.INFO,
      'DISCONNECTED from ' + peerData.id + ' through ' + connectionIdFor(this.peerId(), peerData.id, peerData.sessionId)
    )
    // TODO - maybe add a callback for the client to know that a peer has been disconnected, also might need to handle connection errors - moliva - 16/12/2019
    if (this.connectedPeers[peerData.id]) {
      delete this.connectedPeers[peerData.id]
    }

    if (this.peerConnectionPromises[peerData.id]) {
      this.peerConnectionPromises[peerData.id].forEach((it) => it.reject())
      delete this.peerConnectionPromises[peerData.id]
    }

    this.emit(PeerWebRTCEvent.PeerConnectionLost, peerData)
  }

  private handleConnection(peerData: ConnectedPeerData) {
    this.log(
      LogLevel.INFO,
      'CONNECTED to ' + peerData.id + ' through ' + connectionIdFor(this.peerId(), peerData.id, peerData.sessionId)
    )

    this.peerConnectionPromises[peerData.id]?.forEach(($) => $.resolve())
    delete this.peerConnectionPromises[peerData.id]

    this.emit(PeerWebRTCEvent.PeerConnectionEstablished, peerData)
  }

  private subscribeToConnection(peerData: ConnectedPeerData, connection: SimplePeer.Instance) {
    connection.on('signal', this.handleSignal(peerData))
    connection.on('close', () => this.handleDisconnection(peerData))
    connection.on('connect', () => this.handleConnection(peerData))

    connection.on('error', (err) => this.handlePeerError(peerData, err, connection))

    connection.on('data', (data) => this.handlePeerPacket(data, peerData.id))
  }

  private handlePeerError(peerData: ConnectedPeerData, err: Error, connection: SimplePeer.Instance) {
    this.log(
      LogLevel.ERROR,
      'error in peer connection ' + connectionIdFor(this.peerId(), peerData.id, peerData.sessionId),
      err
    )
    connection.removeAllListeners()
    connection.destroy()
    this.handleDisconnection(peerData)
  }

  private handlePeerPacket(data: Uint8Array, peerId: string) {
    if (this.disposed) return
    this.config.packetHandler(data, peerId)
  }

  private isReadyToEmitSignals() {
    return this.config.isReadyToEmitSignals()
  }

  private handleSignal(peerData: ConnectedPeerData) {
    const connectionId = connectionIdFor(this.peerId(), peerData.id, peerData.sessionId)
    return (data: SignalData) => {
      if (this.disposed) return
      // We ignore signals for connections that we are not referencing (could be old connections)
      if (!this.connectedPeers[peerData.id] || this.connectedPeers[peerData.id].sessionId !== peerData.sessionId) return

      this.log(LogLevel.DEBUG, `Signal in peer connection ${connectionId}: ${data.type ?? 'candidate'}`)
      if (this.isReadyToEmitSignals()) {
        if (data.type === PeerSignals.offer) {
          this.peerJsConnection.sendOffer(peerData, {
            sdp: data,
            sessionId: peerData.sessionId,
            connectionId,
            ...this.config.handshakePayloadExtras()
          })
        } else if (data.type === PeerSignals.answer) {
          this.peerJsConnection.sendAnswer(peerData, {
            sdp: data,
            sessionId: peerData.sessionId,
            connectionId,
            ...this.config.handshakePayloadExtras()
          })
        } else if (data.candidate) {
          this.peerJsConnection.sendCandidate(peerData, data, connectionId)
        }
      } else {
        this.log(
          LogLevel.WARN,
          'Ignoring connection signal since the peer is not ready to emit signals yet',
          peerData,
          data
        )
      }
    }
  }

  private getOrCreatePeer(peerId: string, initiator: boolean = false, room: string, sessionId?: string) {
    let peer = this.connectedPeers[peerId]
    if (!peer) {
      sessionId = sessionId ?? util.generateToken(16)
      peer = this.createPeerConnection(peerId, sessionId!, initiator)
    } else if (sessionId) {
      if (peer.sessionId !== sessionId) {
        this.log(
          LogLevel.INFO,
          `Received new connection from peer with new session id. Peer: ${peer.id}. Old: ${peer.sessionId}. New: ${sessionId}. Initiator: ${initiator}`
        )
        peer.connection.removeAllListeners()
        peer.connection.destroy()
        peer = this.createPeerConnection(peerId, sessionId, initiator)
      }
    }
    return peer
  }

  private createPeerConnection(peerId: string, sessionId: string, initiator: boolean): ConnectedPeerData {
    const peer = (this.connectedPeers[peerId] = {
      id: peerId,
      sessionId,
      initiator,
      createTimestamp: TimeKeeper.now(),
      connection: new SimplePeer({
        initiator,
        config: this.config.rtcConnectionConfig,
        channelConfig: {
          label: connectionIdFor(this.peerId(), peerId, sessionId)
        },
        wrtc: this.config.wrtc,
        objectMode: true
      })
    })

    this.subscribeToConnection(peer, peer.connection)
    return peer
  }

  private handleHandshakePayload(payload: HandshakeData, peerId: string) {
    const result = this.config.handshakeValidator(payload, peerId)

    if (!result.ok) {
      this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, result.message ?? '')
      return
    }

    const peer = this.getOrCreatePeer(peerId, false, payload.label, payload.sessionId)

    this.signalMessage(peer, payload.sdp)
  }

  private handleOfferPayload(payload: any, peerId: string) {
    if (this.checkForCrossOffers(peerId)) {
      return
    }

    const result = this.config.receivedOfferValidator(payload, peerId)

    if (!result.ok) {
      this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, result.message ?? '')
      return
    }

    this.handleHandshakePayload(payload, peerId)
  }

  private checkForCrossOffers(peerId: string, sessionId?: string) {
    const isCrossOfferToBeDiscarded =
      this.hasInitiatedConnectionFor(peerId) &&
      (!sessionId || this.connectedPeers[peerId].sessionId !== sessionId) &&
      this.peerId() < peerId
    if (isCrossOfferToBeDiscarded) {
      this.log(LogLevel.WARN, 'Received offer/candidate for already existing peer but it was discarded: ' + peerId)
    }

    return isCrossOfferToBeDiscarded
  }

  hasConnectionsFor(peerId: string) {
    return !!this.connectedPeers[peerId]
  }

  private hasInitiatedConnectionFor(peerId: string) {
    return this.hasConnectionsFor(peerId) && this.connectedPeers[peerId].initiator
  }

  private handleCandidatePayload(peerId: string, payload: any) {
    if (this.checkForCrossOffers(peerId, payload.sessionId)) {
      return
    }
    // If we receive a candidate for a connection that we don't have, we ignore it
    if (!this.hasConnectionsFor(peerId)) {
      this.log(LogLevel.INFO, `Received candidate for unknown peer connection: ${peerId}. Ignoring.`)
      return
    }
    const peer = this.getOrCreatePeer(peerId, false, payload.label, payload.sessionId)

    this.signalMessage(peer, {
      candidate: payload.candidate
    })
  }

  private handleRejection(peerId: string, reason: string) {
    const peer = this.connectedPeers[peerId]
    peer?.connection?.destroy()
    delete this.connectedPeers[peerId]
    this.emit(PeerWebRTCEvent.ConnectionRequestRejected, peerId, reason)
  }

  private signalMessage(peer: ConnectedPeerData, signal: SignalData) {
    try {
      peer.connection.signal(signal)
    } catch (e) {
      // If this fails, then most likely the connection hasn't been initialized properly (RTCPeerConnection couldn't be created)
      // We handle it with the same error handler as any other error

      this.handlePeerError(peer, e, peer.connection)
    }
  }

  handleMessage(message: ServerMessage): void {
    if (this.disposed) return
    const { type, payload, src: peerId, dst } = message

    if (dst === this._peerId) {
      this.log(LogLevel.DEBUG, `Received message from ${peerId}: ${type}`, message)
      switch (type) {
        case ServerMessageType.Offer: {
          this.handleOfferPayload(payload, peerId)
          break
        }
        case ServerMessageType.Answer: {
          this.handleHandshakePayload(payload, peerId)
          break
        }
        case ServerMessageType.Candidate: {
          this.handleCandidatePayload(peerId, payload)
          break
        }
        case ServerMessageType.Reject: {
          this.handleRejection(peerId, payload.reason)
          break
        }
        default: {
          this.config.serverMessageHandler(message as PeerOutgoingMessage)
        }
      }
    }
  }

  awaitConnectionEstablished(timeoutMs: number = 10000): Promise<void> {
    // check connection state
    if (this.peerJsConnection.connected) {
      return Promise.resolve()
    } else if (this.peerJsConnection.disconnected) {
      return Promise.reject(this.disconnectionCause ?? new Error('Peer already disconnected!'))
    }

    // otherwise wait for connection to be established/rejected
    const result = future<void>()

    setTimeout(() => {
      result.isPending &&
        result.reject(new Error(`[${this.maybePeerId()}] Awaiting connection to server timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    this.peerJsConnection.on(PeerEventType.Error, async (err) => {
      if (result.isPending) {
        return result.reject(err)
      }
    })

    this.peerJsConnection.on(PeerEventType.Valid, () => result.isPending && result.resolve())

    return result
  }

  async connectTo(peerId: string) {
    const peer = this.createPeerConnection(peerId, util.generateToken(16), true)

    return this.beConnectedTo(peer.id, this.config.peerConnectTimeout).catch((e) => {
      // If we timeout, we want to abort the connection
      this.disconnectFrom(peerId, false)
      throw e
    })
  }

  beConnectedTo(peerId: string, timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const promisePair = { resolve, reject }
      if (this.isConnectedTo(peerId)) {
        resolve()
      } else {
        this.peerConnectionPromises[peerId] = [...(this.peerConnectionPromises[peerId] || []), promisePair]
      }

      setTimeout(() => {
        if (!this.isConnectedTo(peerId) && this.peerConnectionPromises[peerId]) {
          reject(
            new Error(`[${this.maybePeerId()}] Awaiting connection to peer ${peerId} timed out after ${timeout}ms`)
          )
          this.peerConnectionPromises[peerId] = this.peerConnectionPromises[peerId].splice(
            this.peerConnectionPromises[peerId].indexOf(promisePair),
            1
          )
        } else {
          resolve()
        }
      }, timeout)
    })
  }

  checkConnectionsSanity() {
    //Since there may be flows that leave connections that are actually lost, we check if relatively
    //old connections are not connected and discard them.
    Object.keys(this.connectedPeers).forEach((it) => {
      if (
        !this.isConnectedTo(it) &&
        TimeKeeper.now() - this.connectedPeers[it].createTimestamp > this.config.oldConnectionsTimeout!
      ) {
        this.log(LogLevel.WARN, `The connection to ${it} is not in a sane state. Discarding it.`)
        this.disconnectFrom(it, false)
      }
    })
  }

  sendPacketToPeer(peerId: string, data: Uint8Array) {
    const conn = this.connectedPeers[peerId]?.connection
    if (conn) {
      conn.send(data)
    }
  }

  private log(level: LogLevel, ...entries: any[]) {
    this.config.logger.log(level, ...entries)
  }

  async dispose() {
    this.disposed = true
    this.cleanConnections()
    return new Promise<void>((resolve, reject) => {
      if (this.peerJsConnection && !this.peerJsConnection.disconnected) {
        this.peerJsConnection.once(PeerEventType.Disconnected, resolve)
        this.peerJsConnection
          .disconnect()
          .then(() => resolve())
          .catch((e) => reject(e))
      } else {
        resolve()
      }
    })
  }
}
