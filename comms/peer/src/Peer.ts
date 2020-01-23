import { PeerJSServerConnection } from "./peerjs-server-connector/peerjsserverconnection";
import { ServerMessage } from "./peerjs-server-connector/servermessage";
import { ServerMessageType } from "./peerjs-server-connector/enums";
import SimplePeer, { SignalData } from "simple-peer";
import { connectionIdFor, util, pickRandom, noReject } from "./peerjs-server-connector/util";
import { SocketBuilder } from "./peerjs-server-connector/socket";
import { KnownPeerData, IPeer, Room, MinPeerData } from "./types";
import { PeerHttpClient } from "./PeerHttpClient";
import { PeerMessageType, PeerMessageTypes } from "./messageTypes";
import { Packet, PayloadEncoding, MessageData } from "./proto/peer_protobuf";
import { Reader } from "protobufjs/minimal";

const PROTOCOL_VERSION = 2;

const MAX_UINT32 = 4294967295;

export type PeerData = {
  id: string;
  sessionId: string;
  initiator: boolean;
  createTimestamp: number;
  connection: SimplePeer.Instance;
};

const PeerSignals = { offer: "offer", answer: "answer" };

function signalMessage(peer: PeerData, connectionId: string, signal: SignalData) {
  peer.connection.signal(signal);
}

type PeerConfig = {
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
};

class Stats {
  public packets: number = 0;
  public packetDuplicates: number = 0;
  public totalBytes: number = 0;
  public averagePacketSize?: number = undefined;
  public duplicatePercentage: number = 0;
  public optimistic: number = 0;

  countPacket(packet: Packet, length: number, duplicate: boolean = false) {
    this.packets += 1;
    if (duplicate) this.packetDuplicates += 1;

    this.totalBytes += length;

    this.averagePacketSize = this.totalBytes / this.packets;
    this.duplicatePercentage = this.packetDuplicates / this.packets;
    if (packet.optimistic) this.optimistic += 1;
  }
}

export type PacketCallback = (sender: string, room: string, payload: any) => void;

export class Peer implements IPeer {
  private peerJsConnection: PeerJSServerConnection;
  private connectedPeers: Record<string, PeerData> = {};

  private peerConnectionPromises: Record<string, { resolve: () => void; reject: () => void }[]> = {};

  private knownPeers: Record<string, KnownPeerData> = {};

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

  private stats: Stats = new Stats();

  constructor(lighthouseUrl: string, public peerId: string, public callback: PacketCallback = () => {}, private config: PeerConfig = {}) {
    const url = new URL(lighthouseUrl);

    this.config.token = this.config.token ?? util.randomToken();

    this.config.minConnections = this.config.minConnections ?? 4;
    this.config.maxConnections = this.config.maxConnections ?? 8;
    this.config.peerConnectTimeout = this.config.peerConnectTimeout ?? 2000;
    this.config.oldConnectionsTimeout = this.config.oldConnectionsTimeout ?? this.config.peerConnectTimeout! * 10;
    this.config.messageExpirationTime = this.config.messageExpirationTime ?? 10000;

    const secure = url.protocol === "https:";

    this.instanceId = Math.floor(Math.random() * MAX_UINT32);

    this.httpClient = new PeerHttpClient(lighthouseUrl, () => this.config.token!);

    this.peerJsConnection = new PeerJSServerConnection(this, peerId, {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : secure ? 443 : 80,
      path: url.pathname,
      secure,
      token: this.config.token,
      heartbeatExtras: () => this.buildTopologyInfo(),
      ...(config.socketBuilder ? { socketBuilder: config.socketBuilder } : {})
    });

    this.wrtc = config.wrtc;

    this.connectionConfig = {
      ...(config.connectionConfig || {})
    };

    const scheduleExpiration = () =>
      setTimeout(() => {
        try {
          this.expireMessages();
        } catch (e) {
          this.log("Couldn't expire messages", e);
        } finally {
          this.expireTimeoutId = scheduleExpiration();
        }
      }, 1000);

    scheduleExpiration();
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
    return { connectedPeerIds: Object.keys(this.connectedPeers) };
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

  private log(...entries: any[]) {
    console.log(`[PEER: ${this.peerId}]`, ...entries);
  }

  async setLayer(layer: string): Promise<void> {
    const { json } = await this.httpClient.fetch(`/layers/${layer}`, {
      method: "PUT",
      bodyObject: { userId: this.peerId, peerId: this.peerId }
    });

    this.currentLayer = layer;
    this.currentRooms.length = 0;
    this.updateKnownPeers(json);
  }

  async joinRoom(roomId: string): Promise<any> {
    this.assertPeerInLayer();

    const { json } = await this.httpClient.fetch(`/layers/${this.currentLayer}/rooms/${roomId}`, {
      method: "PUT",
      bodyObject: { userId: this.peerId, peerId: this.peerId }
    });

    const roomUsers: MinPeerData[] = json;

    const room = {
      id: roomId,
      users: roomUsers.map(data => data.userId)
    };

    this.currentRooms.push(room);
    this.updateKnownPeersWithRoom(room, roomUsers);

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
      .filter(it => it.userId !== this.peerId)
      .forEach(it => {
        if (!this.knownPeers[it.userId] || typeof this.knownPeers[it.userId].rooms === "undefined") {
          this.knownPeers[it.userId] = { ...it, rooms: [room.id], timestampByType: {} };
        } else if (this.knownPeers[it.userId].rooms.indexOf(room.id) < 0) {
          this.knownPeers[it.userId].rooms.push(room.id);
        }
      });
  }

  private updateKnownPeers(newPeers: MinPeerData[]) {
    //We remove those peers that are not in this newPeers list
    Object.keys(this.knownPeers).forEach(userId => {
      if (!newPeers.some($ => $.userId === userId)) {
        this.removeKnownPeer(userId);
      }
    });

    newPeers.forEach(peer => {
      //We only replace those that were not previously added
      if (peer.userId !== this.peerId) {
        this.addKnownPeer(peer);
      }
    });
  }

  private addKnownPeer(peer: MinPeerData) {
    if (!this.knownPeers[peer.userId]) this.knownPeers[peer.userId] = { rooms: [], ...peer, timestampByType: {} };
  }

  private removeKnownPeer(userId: string) {
    const peerData = this.knownPeers[userId];
    delete this.knownPeers[userId];
    if (peerData) {
      peerData.rooms.forEach(room => this.removeUserFromRoom(room, userId));
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
    if (this.updatingNetwork) {
      return;
    }

    this.updatingNetwork = true;
    return new Promise(async (resolve, reject) => {
      this.checkConnectionsSanity();

      let toConnectCount = this.config.minConnections! - this.connectedCount();
      let remaining = this.calculateConnectionCandidates();
      let toConnect = [] as string[];
      while (toConnectCount > 0 && remaining.length > 0) {
        this.log(`Updating network. Trying to establish ${toConnectCount} connections with candidates`, remaining);

        [toConnect, remaining] = pickRandom(remaining, toConnectCount);

        this.log(`Updating network. Picked ${toConnect}`);

        const connectionResults = await Promise.all(toConnect.map(candidate => noReject(this.connectTo(this.knownPeers[candidate]))));

        this.log(`Updating network. Connection result: `, connectionResults);

        toConnectCount = connectionResults.filter(([status]) => status === "rejected").length;
      }

      this.updatingNetwork = false;

      resolve();
    });
  }

  private checkConnectionsSanity() {
    //Since there may be flows that leave connections that are actually lost, we check if relatively
    //old connections are not connected and discard them.
    Object.keys(this.connectedPeers).forEach(it => {
      if (!this.isConnectedTo(it) && new Date().getTime() - this.connectedPeers[it].createTimestamp > this.config.oldConnectionsTimeout!) {
        console.log(`The connection to ${it} is not in a sane state. Discarding it.`);
        this.disconnectFrom(it);
      }
    });
  }

  private connectedCount() {
    return Object.keys(this.connectedPeers).length;
  }

  async connectTo(known: KnownPeerData) {
    const peer = this.createPeer(known.peerId, util.generateToken(16), true);

    return this.beConnectedTo(peer.id, this.config.peerConnectTimeout).catch(e => {
      // If we timeout, we want to abort the connection
      this.disconnectFrom(known.peerId);
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

  public beConnectedTo(peerId: string, timeout: number = 10000): Promise<void> {
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

  public disconnectFrom(peerId: string) {
    if (this.connectedPeers[peerId]) {
      this.log("[PEER] Disconnecting from " + peerId);
      this.connectedPeers[peerId].connection.destroy();
      delete this.connectedPeers[peerId];
    } else {
      this.log("[PEER] Already not connected to peer " + peerId);
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
      this.log("error in peer connection " + connectionIdFor(this.peerId, peerData.id, peerData.sessionId), err);
      connection.removeAllListeners();
      connection.destroy();
      this.handleDisconnection(peerData);
    });

    connection.on("data", data => this.handlePeerPacket(data, peerData.id));
  }

  private updateTimeStamp(peerId: string, subtype: string | undefined, timestamp: number) {
    const knownPeer = this.knownPeers[peerId];
    if (knownPeer) {
      knownPeer.timestamp = Math.max(knownPeer.timestamp ?? Number.MIN_SAFE_INTEGER, timestamp);
      if (subtype) {
        knownPeer.timestampByType[subtype] = Math.max(knownPeer.timestampByType[subtype] ?? Number.MIN_SAFE_INTEGER, timestamp);
      }
    }
  }

  private handlePeerPacket(data: Uint8Array, peerId: string) {
    data.constructor = Uint8Array;
    const packet: Packet = Packet.decode(Reader.create(data));
    // if (parsed.hasMessagedata()) {

    const alreadyReceived = !!this.receivedPackets[this.packetKey(packet)];

    this.stats.countPacket(packet, data.length, alreadyReceived);

    this.markReceived(packet);

    const expired = this.checkExpired(packet);

    if (!alreadyReceived && !expired) {
      this.updateTimeStamp(packet.src, packet.subtype, packet.timestamp);

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
      const timestamp = this.knownPeers[packet.src]?.timestampByType[packet.subtype];
      discardedByOlderThan = !!timestamp && timestamp - packet.timestamp > packet.discardOlderThan;
    }

    let discardedByExpireTime: boolean = false;
    const expireTime = this.getExpireTime(packet);

    if (this.knownPeers[packet.src]?.timestamp) {
      discardedByExpireTime = this.knownPeers[packet.src]?.timestamp - packet.timestamp > expireTime;
    }

    return discardedByOlderThan || discardedByExpireTime;
  }

  private isInRoom(room: string) {
    return this.currentRooms.some(it => it.id === room);
  }

  private handleDisconnection(peerData: PeerData) {
    this.log("DISCONNECTED from " + peerData.id + " through " + connectionIdFor(this.peerId, peerData.id, peerData.sessionId));
    // TODO - maybe add a callback for the client to know that a peer has been disconnected, also might need to handle connection errors - moliva - 16/12/2019
    if (this.connectedPeers[peerData.id]) {
      delete this.connectedPeers[peerData.id];
    }

    if (this.peerConnectionPromises[peerData.id]) {
      this.peerConnectionPromises[peerData.id].forEach(it => it.reject());
      delete this.peerConnectionPromises[peerData.id];
    }

    this.updateNetwork();
    // TODO: Is there something else that we should do when someone disconnects? Maybe update the rooms and the known peers
  }

  private generateMessageId() {
    this.currentMessageId += 1;
    return this.currentMessageId;
  }

  private handleConnection(peerData: PeerData) {
    this.log("CONNECTED to " + peerData.id + " through " + connectionIdFor(this.peerId, peerData.id, peerData.sessionId));

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

  sendMessage(roomId: string, payload: any, type: PeerMessageType = PeerMessageTypes.reliable) {
    const room = this.currentRooms.find(room => room.id === roomId);
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
      messageData: messageData,
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
      packet.receivedBy = [...packet.receivedBy, ...peersToSend];
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
      this.log(`Signal in peer connection ${connectionId}: ${data.type ?? "candidate"}`);
      if (data.type === PeerSignals.offer) {
        this.peerJsConnection.sendOffer(peerData, { sdp: data, sessionId: peerData.sessionId, connectionId, protocolVersion: PROTOCOL_VERSION });
      } else if (data.type === PeerSignals.answer) {
        this.peerJsConnection.sendAnswer(peerData, { sdp: data, sessionId: peerData.sessionId, connectionId, protocolVersion: PROTOCOL_VERSION });
      } else if (data.candidate) {
        this.peerJsConnection.sendCandidate(peerData, data, connectionId);
      }
    };
  }

  private getOrCreatePeer(peerId: string, initiator: boolean = false, room: string, sessionId?: string) {
    let peer = this.connectedPeers[peerId];
    if (!peer) {
      sessionId = sessionId ?? util.generateToken(16);
      peer = this.createPeer(peerId, sessionId!, initiator);
    } else if (sessionId) {
      if (peer.sessionId !== sessionId) {
        this.log(`Received new connection from peer with new session id. Peer: ${peer.id}. Old: ${peer.sessionId}. New: ${sessionId}`);
        peer.connection.removeAllListeners();
        peer.connection.destroy();
        peer = this.createPeer(peerId, sessionId, initiator);
      }
    }
    return peer;
  }

  private createPeer(peerId: string, sessionId: string, initiator: boolean): PeerData {
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
    const { type, payload, src: peerId, dst } = message;

    if (dst === this.peerId) {
      this.log(`Received message from ${peerId}: ${type}`);
      switch (type) {
        case ServerMessageType.Offer:
          if (this.checkForCrossOffers(peerId)) {
            break;
          }

          if (payload.protocolVersion !== PROTOCOL_VERSION) {
            this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, "INCOMPATIBLE_PROTOCOL_VERSION");
            break;
          }

          if (this.connectedCount() >= this.config.maxConnections!) {
            this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, "TOO_MANY_CONNECTIONS");
            break;
          }
        case ServerMessageType.Answer: {
          const peer = this.getOrCreatePeer(peerId, false, payload.label, payload.sessionId);
          signalMessage(peer, payload.connectionId, payload.sdp);
          break;
        }
        case ServerMessageType.Candidate: {
          if (this.checkForCrossOffers(peerId, payload.sessionId)) {
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
          break;
        }
        case ServerMessageType.PeerLeftRoom: {
          const { roomId, userId } = payload;
          this.removeUserFromRoom(roomId, userId);
          break;
        }
        case ServerMessageType.PeerLeftLayer: {
          const { layerId, userId } = payload;
          if (this.currentLayer === layerId) {
            this.removeKnownPeer(userId);
          }
          break;
        }
        case ServerMessageType.PeerJoinedRoom: {
          const { roomId, userId, peerId } = payload;
          this.addUserToRoom(roomId, { userId, peerId });
          break;
        }
        case ServerMessageType.PeerJoinedLayer: {
          const { layerId, userId, peerId } = payload;
          if (this.currentLayer === layerId) {
            this.addKnownPeer({ userId, peerId });
          }
          break;
        }
      }
    }
  }

  private removeUserFromRoom(roomId: string, userId: string) {
    const room = this.findRoom(roomId);
    if (room) {
      const userIndex = room.users.indexOf(userId);
      if (userIndex >= 0) room.users.splice(userIndex, 1);
    }
  }

  private addUserToRoom(roomId: string, peerData: MinPeerData) {
    peerData.rooms = [...(peerData.rooms ?? []), roomId];

    const knownPeer = this.knownPeers[peerData.userId];
    if (!knownPeer) {
      this.addKnownPeer(peerData);
    } else if (!knownPeer.rooms.includes(roomId)) {
      knownPeer.rooms.push(roomId);
    }

    const room = this.findRoom(roomId);
    if (room && !room.users.includes(peerData.userId)) {
      room.users.push(peerData.userId);
    }
  }

  private checkForCrossOffers(peerId: string, sessionId?: string) {
    const isCrossOfferToBeDiscarded = this.hasInitiatedConnectionFor(peerId) && (!sessionId || this.connectedPeers[peerId].sessionId != sessionId) && this.peerId < peerId;
    if (isCrossOfferToBeDiscarded) {
      this.log("Received offer/candidate for already existing peer but it was discarded: " + peerId);
    }

    return isCrossOfferToBeDiscarded;
  }

  async dispose() {
    clearTimeout(this.expireTimeoutId);
  }
}
