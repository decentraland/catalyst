import { PeerJSServerConnection } from "./peerjs-server-connector/peerjsserverconnection";
import { ServerMessage } from "./peerjs-server-connector/servermessage";
import { ServerMessageType, PeerEventType } from "./peerjs-server-connector/enums";
import SimplePeer, { SignalData } from "simple-peer";
import { connectionIdFor, util, pickRandom, noReject, delay } from "./peerjs-server-connector/util";
import { SocketBuilder } from "./peerjs-server-connector/socket";
import { KnownPeerData, IPeer, Room, MinPeerData } from "./types";
import { PeerHttpClient } from "./PeerHttpClient";
import { PeerMessageType } from "./messageTypes";
import { Packet, PayloadEncoding, MessageData } from "./proto/peer_protobuf";
import { Reader } from "protobufjs/minimal";
import { future } from "fp-future";

const PROTOCOL_VERSION = 4;

const MAX_UINT32 = 4294967295;

export type PeerData = {
  id: string;
  sessionId: string;
  initiator: boolean;
  createTimestamp: number;
  connection: SimplePeer.Instance;
};

export type PositionConfig<PositionType> = {
  selfPosition: () => PositionType;
  distance: (l1: PositionType, l2: PositionType) => number;
};

type PeerResponse = { id?: string; userId?: string; peerId?: string };

enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  NONE = Number.MAX_SAFE_INTEGER
}

const PeerSignals = { offer: "offer", answer: "answer" };

const MUST_BE_IN_SAME_DOMAIN_AND_LAYER = "MUST_BE_IN_SAME_DOMAIN_AND_LAYER";

function signalMessage(peer: PeerData, connectionId: string, signal: SignalData) {
  peer.connection.signal(signal);
}

type PeerConfig<PositionType> = {
  connectionConfig?: any;
  wrtc?: any;
  socketBuilder?: SocketBuilder;
  token?: string;
  sessionId?: string;
  minConnections?: number;
  maxConnections?: number;
  peerConnectTimeout?: number;
  oldConnectionsTimeout?: number;
  messageExpirationTime?: number;
  logLevel?: keyof typeof LogLevel;
  reconnectionAttempts?: number;
  backoffMs?: number;
  authHandler?: (msg: string) => Promise<string>;
  positionConfig?: PositionConfig<PositionType>;
  statusHandler?: (status: string) => void;
};

class Stats {
  public expired: number = 0;
  public expiredPercentage: number = 0;
  public packetDuplicates: number = 0;
  public duplicatePercentage: number = 0;
  public averagePacketSize?: number = undefined;
  public optimistic: number = 0;
  public packets: number = 0;
  public totalBytes: number = 0;

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    this.packets += 1;
    if (duplicate) this.packetDuplicates += 1;

    this.totalBytes += length;

    this.averagePacketSize = this.totalBytes / this.packets;
    this.duplicatePercentage = this.packetDuplicates / this.packets;
    if (packet.optimistic) this.optimistic += 1;
    if (expired) this.expired += 1;
    this.expiredPercentage = this.expired / this.packets;
  }
}

class GlobalStats extends Stats {
  public statsByType: Record<string, Stats> = {};

  countPacket(packet: Packet, length: number, duplicate: boolean = false, expired: boolean = false) {
    super.countPacket(packet, length, duplicate, expired);
    if (packet.subtype) {
      const stats = (this.statsByType[packet.subtype] = this.statsByType[packet.subtype] ?? new Stats());
      stats.countPacket(packet, length, duplicate, expired);
    }
  }
}

export type PacketCallback = (sender: string, room: string, payload: any) => void;

export class Peer<PositionType = [number, number, number]> implements IPeer<PositionType> {
  private peerJsConnection: PeerJSServerConnection;
  private connectedPeers: Record<string, PeerData> = {};

  private peerConnectionPromises: Record<string, { resolve: () => void; reject: () => void }[]> = {};

  private knownPeers: Record<string, KnownPeerData<PositionType>> = {};

  private receivedPackets: Record<string, { timestamp: number; expirationTime: number }> = {};

  private currentLayer?: string;

  public readonly currentRooms: Room[] = [];
  private connectionConfig: any;
  private wrtc: any;
  private httpClient: PeerHttpClient;

  private updatingNetwork: boolean = false;
  private currentMessageId: number = 0;
  private instanceId: number;

  private expireTimeoutId: any;

  private stats = new GlobalStats();

  private disposed: boolean = false;

  public logLevel: keyof typeof LogLevel = "INFO";

  constructor(
    lighthouseUrl: string,
    public peerId: string,
    public callback: PacketCallback = () => {},
    private config: PeerConfig<PositionType> = { authHandler: msg => Promise.resolve(msg), statusHandler: () => {} }
  ) {
    if (this.config.logLevel) {
      this.logLevel = this.config.logLevel;
    }

    this.config.token = this.config.token ?? util.randomToken();

    this.config.minConnections = this.config.minConnections ?? 4;
    this.config.maxConnections = this.config.maxConnections ?? 8;
    this.config.peerConnectTimeout = this.config.peerConnectTimeout ?? 2000;
    this.config.oldConnectionsTimeout = this.config.oldConnectionsTimeout ?? this.config.peerConnectTimeout! * 10;
    this.config.messageExpirationTime = this.config.messageExpirationTime ?? 10000;
    this.config.reconnectionAttempts = this.config.reconnectionAttempts ?? 10;
    this.config.backoffMs = this.config.backoffMs ?? 2000;

    this.instanceId = Math.floor(Math.random() * MAX_UINT32);

    this.setLighthouseUrl(lighthouseUrl);

    this.wrtc = config.wrtc;

    this.connectionConfig = {
      ...(config.connectionConfig || {})
    };

    const scheduleExpiration = () =>
      setTimeout(() => {
        try {
          this.expireMessages();
        } catch (e) {
          this.log(LogLevel.ERROR, "Couldn't expire messages", e);
        } finally {
          this.expireTimeoutId = scheduleExpiration();
        }
      }, 1000);

    scheduleExpiration();
  }

  public setLighthouseUrl(lighthouseUrl: string) {
    this.peerJsConnection?.disconnect().catch(e => this.log(LogLevel.DEBUG, "Error while disconnecting ", e));

    this.cleanStateAndConnections();

    this.currentLayer = undefined;

    const url = new URL(lighthouseUrl);
    const secure = url.protocol === "https:";
    this.httpClient = new PeerHttpClient(lighthouseUrl, () => this.config.token!);
    this.peerJsConnection = new PeerJSServerConnection(this, this.peerId, {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : secure ? 443 : 80,
      path: url.pathname,
      secure,
      token: this.config.token,
      authHandler: this.config.authHandler,
      heartbeatExtras: () => ({
        ...this.buildTopologyInfo(),
        ...this.buildPositionInfo()
      }),
      ...(this.config.socketBuilder ? { socketBuilder: this.config.socketBuilder } : {})
    });
  }

  private expireMessages() {
    const currentTimestamp = new Date().getTime();

    const keys = Object.keys(this.receivedPackets);

    keys.forEach(id => {
      const received = this.receivedPackets[id];
      if (currentTimestamp - received.timestamp > received.expirationTime) {
        delete this.receivedPackets[id];
      }
    });
  }

  private buildTopologyInfo() {
    return { connectedPeerIds: this.fullyConnectedPeerIds() };
  }

  private buildPositionInfo() {
    return this.config.positionConfig ? { parcel: this.config.positionConfig.selfPosition() } : {};
  }

  private markReceived(packet: Packet) {
    this.receivedPackets[this.packetKey(packet)] = { timestamp: new Date().getTime(), expirationTime: this.getExpireTime(packet) };
  }

  private packetKey(packet: Packet) {
    return `${packet.src}_${packet.instanceId}_${packet.sequenceId}`;
  }

  private getExpireTime(packet: Packet): number {
    return packet.expireTime > 0 ? packet.expireTime : this.config.messageExpirationTime!;
  }

  awaitConnectionEstablished(timeoutMs: number = 10000): Promise<void> {
    // check connection state
    if (this.peerJsConnection.connected) {
      return Promise.resolve();
    } else if (this.peerJsConnection.disconnected) {
      return Promise.reject(new Error("Peer already disconnected!"));
    }

    // otherwise wait for connection to be established/rejected
    const result = future<void>();

    setTimeout(() => {
      result.isPending && result.reject(new Error(`[${this.peerId}] Awaiting connection to server timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    this.peerJsConnection.on(PeerEventType.Error, async err => {
      if (result.isPending) {
        return result.reject(err);
      }

      await this.retryConnection();
    });

    this.peerJsConnection.on(PeerEventType.Valid, () => result.isPending && result.resolve());

    return result;
  }

  private async retryConnection() {
    const layer = this.currentLayer;
    const rooms = this.currentRooms.slice();

    const { reconnectionAttempts, backoffMs } = this.config;

    for (let i = 1; ; ++i) {
      this.log(LogLevel.DEBUG, `Connection attempt `, i);
      // To avoid synced retries, we use a random delay
      await delay(backoffMs! + Math.floor(Math.random() * backoffMs!));

      try {
        this.setLighthouseUrl(this.lighthouseUrl());
        await this.awaitConnectionEstablished();

        if (layer) {
          await this.setLayer(layer);
          for (const room of rooms) {
            await this.joinRoom(room.id);
          }
        }
        // successfully reconnected
        break;
      } catch (e) {
        this.log(LogLevel.WARN, `Error while reconnecting (attempt ${i}) `, e);
        if (i >= reconnectionAttempts!) {
          this.log(LogLevel.ERROR, `Could not reconnect after ${reconnectionAttempts} failed attempts `, e);
          this.config.statusHandler!("reconnection-error");
          break;
        }
      }
    }
  }

  private log(level: LogLevel, ...entries: any[]) {
    const currentLogLevelEnum = LogLevel[this.logLevel];
    if (level >= currentLogLevelEnum) {
      const levelText = LogLevel[level];
      console.log(`[PEER: ${this.peerId}][${levelText}]`, ...entries);
    }
  }

  async setLayer(layer: string): Promise<void> {
    if (this.disposed) return;
    const { json } = await this.httpClient.fetch(`/layers/${layer}`, {
      method: "PUT",
      // userId and peerId are deprecated but we leave them here for compatibility. When all lighthouses are safely updated they should be removed
      bodyObject: { id: this.peerId, userId: this.peerId, peerId: this.peerId, protocolVersion: PROTOCOL_VERSION }
    });

    const layerUsers: PeerResponse[] = json;

    this.currentLayer = layer;
    this.cleanStateAndConnections();
    this.updateKnownPeers(layerUsers.map(it => ({ id: (it.id ?? it.userId)! })));

    //@ts-ignore
    const ignored = this.updateNetwork();
  }

  private cleanStateAndConnections() {
    this.currentRooms.length = 0;
    this.knownPeers = {};
    Object.keys(this.connectedPeers).forEach(it => this.disconnectFrom(it));
  }

  async joinRoom(roomId: string): Promise<any> {
    if (this.disposed) return;
    this.assertPeerInLayer();

    const room = {
      id: roomId,
      users: [] as string[]
    };

    this.currentRooms.push(room);

    const { json } = await this.httpClient.fetch(`/layers/${this.currentLayer}/rooms/${roomId}`, {
      method: "PUT",
      // userId and peerId are deprecated but we leave them here for compatibility. When all lighthouses are safely updated they should be removed
      bodyObject: { id: this.peerId, userId: this.peerId, peerId: this.peerId }
    });

    const roomUsers: PeerResponse[] = json;

    room.users = roomUsers.map(it => (it.id ?? it.userId)!);

    this.updateKnownPeersWithRoom(
      room,
      roomUsers.map(it => ({ id: (it.id ?? it.userId)! }))
    );

    await this.updateNetwork();
    return await this.roomConnectionHealthy(roomId);
  }

  private updateKnownPeersWithRoom(room: Room, roomPeersData: MinPeerData[]) {
    //We remove the room for those known peers which are not in the room and have it
    Object.keys(this.knownPeers).forEach(it => {
      const roomIndex = this.knownPeers[it].rooms?.indexOf(room.id);
      if (roomIndex && room.users.indexOf(it) < 0 && roomIndex > 0) {
        this.knownPeers[it].rooms.splice(roomIndex, 1);
      }
    });

    //We add the room to those known peers that are in the room
    roomPeersData
      .filter(it => it.id !== this.peerId)
      .forEach(it => {
        if (!this.knownPeers[it.id] || typeof this.knownPeers[it.id].rooms === "undefined") {
          this.knownPeers[it.id] = { ...it, rooms: [room.id], subtypeData: {} };
        } else if (this.knownPeers[it.id].rooms.indexOf(room.id) < 0) {
          this.knownPeers[it.id].rooms.push(room.id);
        }
      });
  }

  private updateKnownPeers(newPeers: MinPeerData[]) {
    //We remove those peers that are not in this newPeers list
    Object.keys(this.knownPeers).forEach(peerId => {
      if (!newPeers.some($ => $.id === peerId)) {
        this.removeKnownPeer(peerId);
      }
    });

    newPeers.forEach(peer => {
      if (peer.id !== this.peerId) {
        this.addKnownPeer(peer);
      }
    });
  }

  private addKnownPeer(peer: MinPeerData) {
    if (!this.knownPeers[peer.id]) this.knownPeers[peer.id] = { rooms: peer.rooms ?? [], ...peer, subtypeData: {} };
  }

  private ensureKnownPeer(packet: Packet) {
    this.addKnownPeer({ id: packet.src, rooms: packet.messageData?.room ? [packet.messageData?.room] : [] });

    if (packet.messageData?.room && !this.knownPeers[packet.src].rooms.includes(packet.messageData?.room)) {
      this.knownPeers[packet.src].rooms.push(packet.messageData.room);
    }
  }

  private removeKnownPeer(peerId: string) {
    const peerData = this.knownPeers[peerId];
    delete this.knownPeers[peerId];
    if (peerData) {
      peerData.rooms.forEach(room => this.removeUserFromRoom(room, peerId));
    }
  }

  async roomConnectionHealthy(roomId: string) {
    // - Send ping to each member of the room
    // - Await responses. Once responces amount reach a certain threshold, assume healthy
    // - If not healthy after 5 seconds (or configurable amount) and if max connections are not reached, establish connection with more peers
    // - If after additional connections still not healthy, fail

    return true;
  }

  calculateConnectionCandidates() {
    return Object.keys(this.knownPeers).filter(key => !this.hasConnectionsFor(key));
  }

  async updateNetwork() {
    if (this.updatingNetwork || this.disposed) {
      return;
    }

    this.updatingNetwork = true;
    return new Promise(async (resolve, reject) => {
      try {
        this.checkConnectionsSanity();

        let toConnectCount = this.config.minConnections! - this.connectedCount();
        let remaining = this.calculateConnectionCandidates();
        let toConnect = [] as string[];
        while (toConnectCount > 0 && remaining.length > 0) {
          this.log(LogLevel.INFO, `Updating network. Trying to establish ${toConnectCount} connections with candidates`, remaining);

          [toConnect, remaining] = pickRandom(remaining, toConnectCount);

          this.log(LogLevel.DEBUG, `Updating network. Picked ${toConnect}`);

          const connectionResults = await Promise.all(toConnect.map(candidate => noReject(this.connectTo(this.knownPeers[candidate]))));

          this.log(LogLevel.INFO, `Updating network. Connection result: `, connectionResults);

          toConnectCount = connectionResults.filter(([status]) => status === "rejected").length;
        }

        const toDisconnect = this.connectedCount() - this.config.maxConnections!;

        //If we are over connected, we disconnect
        if (toDisconnect > 0) {
          Object.keys(this.connectedPeers)
            .sort((peer1, peer2) => this.connectedPeers[peer1].createTimestamp - this.connectedPeers[peer2].createTimestamp)
            .slice(0, toDisconnect)
            .forEach(peerId => this.disconnectFrom(peerId));
        }
        resolve();
      } catch (e) {
        this.log(LogLevel.ERROR, "Error while updating network", e);
      } finally {
        this.updatingNetwork = false;
      }
    });
  }

  private checkConnectionsSanity() {
    //Since there may be flows that leave connections that are actually lost, we check if relatively
    //old connections are not connected and discard them.
    Object.keys(this.connectedPeers).forEach(it => {
      if (!this.isConnectedTo(it) && Date.now() - this.connectedPeers[it].createTimestamp > this.config.oldConnectionsTimeout!) {
        this.log(LogLevel.WARN, `The connection to ${it} is not in a sane state. Discarding it.`);
        this.disconnectFrom(it, false);
      }
    });
  }

  connectedCount() {
    return this.fullyConnectedPeerIds().length;
  }

  private fullyConnectedPeerIds() {
    return Object.keys(this.connectedPeers).filter(it => this.isConnectedTo(it));
  }

  async connectTo(known: KnownPeerData<PositionType>) {
    const peer = this.createPeerConnection(known.id, util.generateToken(16), true);

    return this.beConnectedTo(peer.id, this.config.peerConnectTimeout).catch(e => {
      // If we timeout, we want to abort the connection
      this.disconnectFrom(known.id, false);
      throw e;
    });
  }

  private assertPeerInLayer() {
    if (!this.currentLayer) throw new Error("Peer needs to have joined a layer to operate with rooms");
  }

  async leaveRoom(roomId: string) {
    this.assertPeerInLayer();

    await this.httpClient.fetch(`/layers/${this.currentLayer}/rooms/${roomId}/users/${this.peerId}`, { method: "DELETE" });

    const index = this.currentRooms.findIndex(room => room.id === roomId);

    if (index === -1) {
      // not in room -> do nothing
      return Promise.resolve();
    }

    this.currentRooms.splice(index, 1);
  }

  beConnectedTo(peerId: string, timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const promisePair = { resolve, reject };
      if (this.isConnectedTo(peerId)) {
        resolve();
      } else {
        this.peerConnectionPromises[peerId] = [...(this.peerConnectionPromises[peerId] || []), promisePair];
      }

      setTimeout(() => {
        if (!this.isConnectedTo(peerId) && this.peerConnectionPromises[peerId]) {
          reject(new Error(`[${this.peerId}] Awaiting connection to peer ${peerId} timed out after ${timeout}ms`));
          this.peerConnectionPromises[peerId] = this.peerConnectionPromises[peerId].splice(this.peerConnectionPromises[peerId].indexOf(promisePair), 1);
        }
      }, timeout);
    });
  }

  disconnectFrom(peerId: string, removeListener: boolean = true) {
    if (this.connectedPeers[peerId]) {
      this.log(LogLevel.INFO, "Disconnecting from " + peerId);
      //We remove close listeners since we are going to destroy the connection anyway. No need to handle the events.
      if (removeListener) this.connectedPeers[peerId].connection.removeAllListeners("close");
      this.connectedPeers[peerId].connection.destroy();
      delete this.connectedPeers[peerId];
    } else {
      this.log(LogLevel.INFO, "[PEER] Already not connected to peer " + peerId);
    }
  }

  setPeerPosition(peerId: string, position: PositionType) {
    if (this.knownPeers[peerId]) {
      this.knownPeers[peerId].position = position;
    }
  }

  private hasConnectionsFor(peerId: string) {
    return !!this.connectedPeers[peerId];
  }

  private hasInitiatedConnectionFor(peerId: string) {
    return this.hasConnectionsFor(peerId) && this.connectedPeers[peerId].initiator;
  }

  private isConnectedTo(peerId: string): boolean {
    return (
      //@ts-ignore The `connected` property is not typed but it seems to be public
      this.connectedPeers[peerId] && this.connectedPeers[peerId].connection.connected
    );
  }

  private findRoom(id: string) {
    return this.currentRooms.find($ => $.id === id);
  }

  private subscribeToConnection(peerData: PeerData, connection: SimplePeer.Instance) {
    connection.on("signal", this.handleSignal(peerData));
    connection.on("close", () => this.handleDisconnection(peerData));
    connection.on("connect", () => this.handleConnection(peerData));

    connection.on("error", err => {
      this.log(LogLevel.ERROR, "error in peer connection " + connectionIdFor(this.peerId, peerData.id, peerData.sessionId), err);
      connection.removeAllListeners();
      connection.destroy();
      this.handleDisconnection(peerData);
    });

    connection.on("data", data => this.handlePeerPacket(data, peerData.id));
  }

  private updateTimeStamp(peerId: string, subtype: string | undefined, timestamp: number, sequenceId: number) {
    const knownPeer = this.knownPeers[peerId];
    knownPeer.timestamp = Math.max(knownPeer.timestamp ?? Number.MIN_SAFE_INTEGER, timestamp);
    if (subtype) {
      const lastData = knownPeer.subtypeData[subtype];
      knownPeer.subtypeData[subtype] = {
        lastTimestamp: Math.max(lastData?.lastTimestamp ?? Number.MIN_SAFE_INTEGER, timestamp),
        lastSequenceId: Math.max(lastData?.lastSequenceId ?? Number.MIN_SAFE_INTEGER, sequenceId)
      };
    }
  }

  private handlePeerPacket(data: Uint8Array, peerId: string) {
    if (this.disposed) return;
    try {
      const packet = Packet.decode(Reader.create(data));

      const alreadyReceived = !!this.receivedPackets[this.packetKey(packet)];

      this.ensureKnownPeer(packet);

      if (packet.discardOlderThan !== 0) {
        //If discardOlderThan is zero, then we don't need to store the package.
        //Same or older packages will be instantly discarded
        this.markReceived(packet);
      }

      const expired = this.checkExpired(packet);

      this.stats.countPacket(packet, data.length, alreadyReceived, expired);

      if (!alreadyReceived && !expired) {
        this.updateTimeStamp(packet.src, packet.subtype, packet.timestamp, packet.sequenceId);

        const messageData = packet.messageData;
        if (messageData) {
          if (this.isInRoom(messageData.room)) {
            this.callback(packet.src, messageData.room, this.decodePayload(messageData.payload, messageData.encoding));
          }
        }

        packet.hops += 1;

        if (packet.hops < packet.ttl) {
          this.sendPacket(packet);
        }
      }
    } catch (e) {
      this.log(LogLevel.WARN, "Failed to process message from: " + peerId, e);
      return;
    }
  }

  decodePayload(payload: Uint8Array, encoding: number): any {
    switch (encoding) {
      case PayloadEncoding.BYTES:
        return payload as Uint8Array;
      case PayloadEncoding.STRING:
        return new TextDecoder("utf-8").decode(payload);
      case PayloadEncoding.JSON:
        return JSON.parse(new TextDecoder("utf-8").decode(payload));
    }
  }

  private checkExpired(packet: Packet) {
    let discardedByOlderThan: boolean = false;
    if (packet.discardOlderThan >= 0 && packet.subtype) {
      const subtypeData = this.knownPeers[packet.src]?.subtypeData[packet.subtype];
      discardedByOlderThan = subtypeData && subtypeData.lastTimestamp - packet.timestamp > packet.discardOlderThan && subtypeData.lastSequenceId >= packet.sequenceId;
    }

    let discardedByExpireTime: boolean = false;
    const expireTime = this.getExpireTime(packet);

    if (this.knownPeers[packet.src].timestamp) {
      discardedByExpireTime = this.knownPeers[packet.src].timestamp! - packet.timestamp > expireTime;
    }

    return discardedByOlderThan || discardedByExpireTime;
  }

  private isInRoom(room: string) {
    return this.currentRooms.some(it => it.id === room);
  }

  private handleDisconnection(peerData: PeerData) {
    this.log(LogLevel.INFO, "DISCONNECTED from " + peerData.id + " through " + connectionIdFor(this.peerId, peerData.id, peerData.sessionId));
    // TODO - maybe add a callback for the client to know that a peer has been disconnected, also might need to handle connection errors - moliva - 16/12/2019
    if (this.connectedPeers[peerData.id]) {
      delete this.connectedPeers[peerData.id];
    }

    if (this.peerConnectionPromises[peerData.id]) {
      this.peerConnectionPromises[peerData.id].forEach(it => it.reject());
      delete this.peerConnectionPromises[peerData.id];
    }
    // We don't need to handle this promise
    // tslint:disable-next-line
    this.updateNetwork();
  }

  private generateMessageId() {
    this.currentMessageId += 1;
    return this.currentMessageId;
  }

  private handleConnection(peerData: PeerData) {
    this.log(LogLevel.INFO, "CONNECTED to " + peerData.id + " through " + connectionIdFor(this.peerId, peerData.id, peerData.sessionId));

    this.peerConnectionPromises[peerData.id]?.forEach($ => $.resolve());
    delete this.peerConnectionPromises[peerData.id];
  }

  private getEncodedPayload(payload: any): [PayloadEncoding, Uint8Array] {
    if (payload instanceof Uint8Array) {
      return [PayloadEncoding.BYTES, payload];
    } else if (typeof payload === "string") {
      return [PayloadEncoding.STRING, new TextEncoder().encode(payload)];
    } else {
      return [PayloadEncoding.JSON, new TextEncoder().encode(JSON.stringify(payload))];
    }
  }

  sendMessage(roomId: string, payload: any, type: PeerMessageType) {
    const room = this.currentRooms.find(_room => _room.id === roomId);
    if (!room) {
      return Promise.reject(new Error(`cannot send a message in a room not joined (${roomId})`));
    }

    const [encoding, encodedPayload] = this.getEncodedPayload(payload);

    const messageData: MessageData = {
      room: roomId,
      encoding,
      payload: encodedPayload,
      dst: []
    };

    const sequenceId = this.generateMessageId();

    const packet: Packet = {
      sequenceId,
      instanceId: this.instanceId,
      subtype: type.name,
      expireTime: type.expirationTime ?? -1,
      discardOlderThan: type.discardOlderThan ?? -1,
      timestamp: new Date().getTime(),
      src: this.peerId,
      messageData,
      hops: 0,
      ttl: this.getTTL(sequenceId, type),
      receivedBy: [],
      optimistic: this.getOptimistic(sequenceId, type),
      pingData: undefined,
      pongData: undefined
    };

    this.sendPacket(packet);

    return Promise.resolve();
  }

  getTTL(index: number, type: PeerMessageType) {
    return typeof type.ttl !== "undefined" ? (typeof type.ttl === "number" ? type.ttl : type.ttl(index, type)) : 10;
  }

  getOptimistic(index: number, type: PeerMessageType) {
    return typeof type.optimistic === "boolean" ? type.optimistic : type.optimistic(index, type);
  }

  private sendPacket(packet: Packet) {
    if (!packet.receivedBy.includes(this.peerId)) packet.receivedBy.push(this.peerId);

    const peersToSend = Object.keys(this.connectedPeers).filter(it => !packet.receivedBy.includes(it));
    if (packet.optimistic) {
      //We only add those connected peers that the connection actually informs as connected
      const fullyConnectedToSend = peersToSend.filter(it => this.fullyConnectedPeerIds().includes(it));
      packet.receivedBy = [...packet.receivedBy, ...fullyConnectedToSend];
    }

    peersToSend.forEach(peer => {
      const conn = this.connectedPeers[peer].connection;
      if (conn?.writable) {
        conn.write(Packet.encode(packet).finish());
      }
    });
  }

  private handleSignal(peerData: PeerData) {
    const connectionId = connectionIdFor(this.peerId, peerData.id, peerData.sessionId);
    return (data: SignalData) => {
      if (this.disposed) return;

      this.log(LogLevel.DEBUG, `Signal in peer connection ${connectionId}: ${data.type ?? "candidate"}`);
      if (this.currentLayer) {
        if (data.type === PeerSignals.offer) {
          this.peerJsConnection.sendOffer(peerData, {
            sdp: data,
            sessionId: peerData.sessionId,
            connectionId,
            protocolVersion: PROTOCOL_VERSION,
            lighthouseUrl: this.lighthouseUrl(),
            layer: this.currentLayer
          });
        } else if (data.type === PeerSignals.answer) {
          this.peerJsConnection.sendAnswer(peerData, {
            sdp: data,
            sessionId: peerData.sessionId,
            connectionId,
            protocolVersion: PROTOCOL_VERSION,
            lighthouseUrl: this.lighthouseUrl(),
            layer: this.currentLayer
          });
        } else if (data.candidate) {
          this.peerJsConnection.sendCandidate(peerData, data, connectionId);
        }
      } else {
        this.log(LogLevel.WARN, "Ignoring connection signal since the peer has not joined a layer yet", peerData, data);
      }
    };
  }

  private lighthouseUrl() {
    return this.httpClient.lighthouseUrl;
  }

  private getOrCreatePeer(peerId: string, initiator: boolean = false, room: string, sessionId?: string) {
    let peer = this.connectedPeers[peerId];
    if (!peer) {
      sessionId = sessionId ?? util.generateToken(16);
      peer = this.createPeerConnection(peerId, sessionId!, initiator);
    } else if (sessionId) {
      if (peer.sessionId !== sessionId) {
        this.log(LogLevel.INFO, `Received new connection from peer with new session id. Peer: ${peer.id}. Old: ${peer.sessionId}. New: ${sessionId}`);
        peer.connection.removeAllListeners();
        peer.connection.destroy();
        peer = this.createPeerConnection(peerId, sessionId, initiator);
      }
    }
    return peer;
  }

  private createPeerConnection(peerId: string, sessionId: string, initiator: boolean): PeerData {
    const peer = (this.connectedPeers[peerId] = {
      id: peerId,
      sessionId,
      initiator,
      createTimestamp: new Date().getTime(),
      connection: new SimplePeer({
        initiator,
        config: this.connectionConfig,
        channelConfig: {
          label: connectionIdFor(this.peerId, peerId, sessionId)
        },
        wrtc: this.wrtc,
        objectMode: true
      })
    });

    this.subscribeToConnection(peer, peer.connection);
    return peer;
  }

  // handles ws messages from this peer's PeerJSServerConnection
  handleMessage(message: ServerMessage): void {
    if (this.disposed) return;
    const { type, payload, src: peerId, dst } = message;

    if (dst === this.peerId) {
      this.log(LogLevel.DEBUG, `Received message from ${peerId}: ${type}`);
      switch (type) {
        case ServerMessageType.Offer:
          if (this.checkForCrossOffers(peerId)) {
            break;
          }

          if (this.connectedCount() >= this.config.maxConnections!) {
            this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, "TOO_MANY_CONNECTIONS");
            break;
          }
        case ServerMessageType.Answer: {
          if (payload.protocolVersion !== PROTOCOL_VERSION) {
            this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, "INCOMPATIBLE_PROTOCOL_VERSION");
            break;
          }

          if (this.httpClient.lighthouseUrl !== payload.lighthouseUrl || this.currentLayer !== payload.layer) {
            this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, MUST_BE_IN_SAME_DOMAIN_AND_LAYER);
            break;
          }

          const peer = this.getOrCreatePeer(peerId, false, payload.label, payload.sessionId);
          signalMessage(peer, payload.connectionId, payload.sdp);
          break;
        }
        case ServerMessageType.Candidate: {
          if (this.checkForCrossOffers(peerId, payload.sessionId)) {
            break;
          }

          //If we receive a candidate for a connection that we don't have, we ignore it
          if (!this.hasConnectionsFor(peerId)) {
            this.log(LogLevel.INFO, `Received candidate for unknown peer connection: ${peerId}. Ignoring.`);
            break;
          }

          const peer = this.getOrCreatePeer(peerId, false, payload.label, payload.sessionId);
          signalMessage(peer, payload.connectionId, {
            candidate: payload.candidate
          });
          break;
        }
        case ServerMessageType.Reject: {
          const peer = this.connectedPeers[peerId];
          peer?.connection?.destroy();
          delete this.connectedPeers[peerId];
          if (payload.reason === MUST_BE_IN_SAME_DOMAIN_AND_LAYER) {
            this.removeKnownPeer(peerId);
          }
          break;
        }
        case ServerMessageType.PeerLeftRoom: {
          const { roomId, userId, id } = payload;
          this.removeUserFromRoom(roomId, id ?? userId);
          break;
        }
        case ServerMessageType.PeerLeftLayer: {
          const { layerId, userId, id } = payload;
          if (this.currentLayer === layerId) {
            this.removeKnownPeer(id ?? userId);
          }
          break;
        }
        case ServerMessageType.PeerJoinedRoom: {
          const { roomId, userId, id } = payload;
          this.addUserToRoom(roomId, { id: id ?? userId });
          break;
        }
        case ServerMessageType.PeerJoinedLayer: {
          const { layerId, userId, id } = payload;
          if (this.currentLayer === layerId) {
            this.addKnownPeer({ id: id ?? userId });
          }
          break;
        }
      }
    }
  }

  private removeUserFromRoom(roomId: string, peerId: string) {
    const room = this.findRoom(roomId);
    if (room) {
      const userIndex = room.users.indexOf(peerId);
      if (userIndex >= 0) room.users.splice(userIndex, 1);
    }
  }

  private addUserToRoom(roomId: string, peerData: MinPeerData) {
    peerData.rooms = [...(peerData.rooms ?? []), roomId];

    const knownPeer = this.knownPeers[peerData.id];
    if (!knownPeer) {
      this.addKnownPeer(peerData);
    } else if (!knownPeer.rooms.includes(roomId)) {
      knownPeer.rooms.push(roomId);
    }

    const room = this.findRoom(roomId);
    if (room && !room.users.includes(peerData.id)) {
      room.users.push(peerData.id);
    }
  }

  private checkForCrossOffers(peerId: string, sessionId?: string) {
    const isCrossOfferToBeDiscarded = this.hasInitiatedConnectionFor(peerId) && (!sessionId || this.connectedPeers[peerId].sessionId !== sessionId) && this.peerId < peerId;
    if (isCrossOfferToBeDiscarded) {
      this.log(LogLevel.WARN, "Received offer/candidate for already existing peer but it was discarded: " + peerId);
    }

    return isCrossOfferToBeDiscarded;
  }

  async dispose() {
    this.disposed = true;
    clearTimeout(this.expireTimeoutId);
    this.cleanStateAndConnections();
    return new Promise<void>((resolve, reject) => {
      if (this.peerJsConnection && !this.peerJsConnection.disconnected) {
        this.peerJsConnection.once(PeerEventType.Disconnected, resolve);
        this.peerJsConnection
          .disconnect()
          .then(() => resolve())
          .catch(e => reject(e));
      } else {
        resolve();
      }
    });
  }
}
