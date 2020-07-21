import { PeerJSServerConnection } from "./peerjs-server-connector/peerjsserverconnection";
import { ServerMessage } from "./peerjs-server-connector/servermessage";
import { ServerMessageType, PeerEventType } from "./peerjs-server-connector/enums";
import SimplePeer, { SignalData } from "simple-peer";
import { connectionIdFor, util, pickRandom, delay, pickBy } from "./peerjs-server-connector/util";
import { KnownPeerData, IPeer, Room, MinPeerData, LogLevel, PingResult, PeerConfig, PacketCallback, ConnectedPeerData } from "./types";
import { PeerHttpClient } from "./PeerHttpClient";
import { PeerMessageType, PingMessageType, PongMessageType, SuspendRelayType } from "./messageTypes";
import { Packet, PayloadEncoding, MessageData, PingData, PongData, SuspendRelayData } from "./proto/peer_protobuf";
import { Reader } from "protobufjs/minimal";
import { future, IFuture } from "fp-future";
import { Position, PeerConnectionHint, discretizedPositionDistance, DISCRETIZE_POSITION_INTERVALS } from "../../../commons/utils/Positions";
import { randomUint32 } from "../../../commons/utils/util";
import { GlobalStats } from "./stats";

const PROTOCOL_VERSION = 4;

const KNOWN_PEER_RELAY_EXPIRE_TIME = 30000;

type PacketData = { messageData: MessageData } | { pingData: PingData } | { pongData: PongData } | { suspendRelayData: SuspendRelayData };

type PeerResponse = { id?: string; userId?: string; peerId?: string; position?: Position };

const PeerSignals = { offer: "offer", answer: "answer" };

const MUST_BE_IN_SAME_DOMAIN_AND_LAYER = "MUST_BE_IN_SAME_DOMAIN_AND_LAYER";

function signalMessage(peer: ConnectedPeerData, connectionId: string, signal: SignalData) {
  peer.connection.signal(signal);
}

type ActivePing = { results: PingResult[]; startTime?: number; future: IFuture<PingResult[]> };

// Try not to use this. It is domain specific and should be phased out eventually
function toParcel(position: any) {
  if (position instanceof Array && position.length === 3) {
    return [Math.floor(position[0] / 16), Math.floor(position[2] / 16)];
  }
}

type NetworkOperation = () => Promise<KnownPeerData[]>;

export class Peer implements IPeer {
  private peerJsConnection: PeerJSServerConnection;
  private connectedPeers: Record<string, ConnectedPeerData> = {};

  private peerConnectionPromises: Record<string, { resolve: () => void; reject: () => void }[]> = {};

  public knownPeers: Record<string, KnownPeerData> = {};

  private receivedPackets: Record<string, { timestamp: number; expirationTime: number }> = {};

  private currentLayer?: string;

  public readonly currentRooms: Room[] = [];
  private connectionConfig: any;
  private wrtc: any;
  private httpClient: PeerHttpClient;

  private updatingNetwork: boolean = false;
  private currentMessageId: number = 0;
  private instanceId: number;

  private expireTimeoutId: NodeJS.Timeout | number;
  private pingTimeoutId?: NodeJS.Timeout | number;

  public stats: GlobalStats;

  private disposed: boolean = false;
  private disconnectionCause: Error | undefined;

  public logLevel: keyof typeof LogLevel = "INFO";

  private timeToRequestOptimumNetwork: number = Number.MAX_SAFE_INTEGER;

  private activePings: Record<string, ActivePing> = {};

  constructor(
    lighthouseUrl: string,
    public peerId?: string,
    public callback: PacketCallback = () => {},
    private config: PeerConfig = { authHandler: (msg) => Promise.resolve(msg), statusHandler: () => {} }
  ) {
    if (this.config.logLevel) {
      this.logLevel = this.config.logLevel;
    }

    this.config.token = this.config.token ?? util.randomToken();

    this.config.targetConnections = this.config.targetConnections ?? 4;
    this.config.maxConnections = this.config.maxConnections ?? 7;
    this.config.peerConnectTimeout = this.config.peerConnectTimeout ?? 3500;
    this.config.oldConnectionsTimeout = this.config.oldConnectionsTimeout ?? this.config.peerConnectTimeout! * 10;
    this.config.messageExpirationTime = this.config.messageExpirationTime ?? 10000;
    this.config.reconnectionAttempts = this.config.reconnectionAttempts ?? 10;
    this.config.backoffMs = this.config.backoffMs ?? 2000;

    if (this.config.positionConfig) {
      this.config.positionConfig.distance = this.config.positionConfig.distance ?? discretizedPositionDistance();
      this.config.positionConfig.nearbyPeersDistance = this.config.positionConfig.nearbyPeersDistance ?? DISCRETIZE_POSITION_INTERVALS[DISCRETIZE_POSITION_INTERVALS.length - 1];
    }

    this.setUpTimeToRequestOptimumNetwork();

    this.instanceId = randomUint32();

    this.setLighthouseUrl(lighthouseUrl);

    this.wrtc = config.wrtc;

    this.connectionConfig = {
      ...(config.connectionConfig || {}),
    };

    const scheduleExpiration = () =>
      setTimeout(() => {
        try {
          this.expireMessages();
          this.expirePeers();
        } catch (e) {
          this.log(LogLevel.ERROR, "Couldn't expire messages", e);
        } finally {
          this.expireTimeoutId = scheduleExpiration();
        }
      }, 2000);

    this.expireTimeoutId = scheduleExpiration();

    if (this.config.pingInterval) {
      const schedulePing = () =>
        setTimeout(async () => {
          try {
            await this.ping();
          } finally {
            this.pingTimeoutId = schedulePing();
          }
        }, this.config.pingInterval);

      this.pingTimeoutId = schedulePing();
    }

    this.stats = new GlobalStats(this.config.statsUpdateInterval ?? 1000);

    this.stats.startPeriod();
  }

  public setLighthouseUrl(lighthouseUrl: string, addRetryListener: boolean = true) {
    this.peerJsConnection?.removeAllListeners();
    this.peerJsConnection?.disconnect().catch((e) => this.log(LogLevel.DEBUG, "Error while disconnecting ", e));

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
        ...this.buildPositionInfo(),
        ...this.optimizeNetworkRequest(),
      }),
      ...(this.config.socketBuilder ? { socketBuilder: this.config.socketBuilder } : {}),
    });

    this.peerJsConnection.on(PeerEventType.AssignedId, (id) => (this.peerId = id));
    this.peerJsConnection.on(PeerEventType.Error, (err) => {
      if (!this.disconnectionCause) this.disconnectionCause = err;
    });
    if (addRetryListener) {
      this.addRetryListenerToConnection();
    }
  }

  private addRetryListenerToConnection() {
    this.peerJsConnection.on(PeerEventType.Error, async (err) => {
      await this.retryConnection();
    });
  }

  public peerIdOrFail(): string {
    if (this.peerId) {
      return this.peerId;
    } else {
      throw new Error("This peer doesn't have an id yet");
    }
  }

  private expireMessages() {
    const currentTimestamp = Date.now();

    const keys = Object.keys(this.receivedPackets);

    keys.forEach((id) => {
      const received = this.receivedPackets[id];
      if (currentTimestamp - received.timestamp > received.expirationTime) {
        delete this.receivedPackets[id];
      }
    });
  }

  private expirePeers() {
    const currentTimestamp = Date.now();

    this.expireKnownPeers(currentTimestamp);
    this.expireConnectedPeers(currentTimestamp);
  }

  private expireConnectedPeers(currentTimestamp: number) {
    Object.keys(this.connectedPeers).forEach((id) => {
      const connected = this.connectedPeers[id];
      // We expire peers suspensions
      Object.keys(connected.ownSuspendedRelays).forEach((srcId) => {
        if (connected.ownSuspendedRelays[srcId] <= currentTimestamp) {
          delete connected.ownSuspendedRelays[srcId];
        }
      });
      Object.keys(connected.theirSuspendedRelays).forEach((srcId) => {
        if (connected.theirSuspendedRelays[srcId] <= currentTimestamp) {
          delete connected.theirSuspendedRelays[srcId];
        }
      });
    });
  }

  private expireKnownPeers(currentTimestamp: number) {
    Object.keys(this.knownPeers).forEach((id) => {
      const lastUpdate = this.knownPeers[id].timestamp;
      if (lastUpdate && currentTimestamp - lastUpdate > 90000) {
        if (this.isConnectedTo(id)) {
          this.disconnectFrom(id);
        }
        delete this.knownPeers[id];
      } else {
        // We expire reachable through data
        Object.keys(this.knownPeers[id].reachableThrough).forEach((relayId) => {
          if (currentTimestamp - this.knownPeers[id].reachableThrough[relayId].timestamp > KNOWN_PEER_RELAY_EXPIRE_TIME) {
            delete this.knownPeers[id].reachableThrough[relayId];
          }
        });
      }
    });
  }

  private buildTopologyInfo() {
    return { connectedPeerIds: this.fullyConnectedPeerIds() };
  }

  private buildPositionInfo() {
    return this.config.positionConfig
      ? {
          position: this.config.positionConfig.selfPosition(),
          // This is domain specific, but we still need it for finding crowded realms
          parcel: toParcel(this.config.positionConfig.selfPosition()),
        }
      : {};
  }

  private optimizeNetworkRequest() {
    const shouldOptimize = Date.now() > this.timeToRequestOptimumNetwork;

    if (shouldOptimize) {
      this.setUpTimeToRequestOptimumNetwork();
      return {
        optimizeNetwork: true,
        targetConnections: this.config.targetConnections,
        maxDistance: this.config.positionConfig?.nearbyPeersDistance,
      };
    } else {
      return {};
    }
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
      return Promise.reject(this.disconnectionCause ?? new Error("Peer already disconnected!"));
    }

    // otherwise wait for connection to be established/rejected
    const result = future<void>();

    setTimeout(() => {
      result.isPending && result.reject(new Error(`[${this.peerId}] Awaiting connection to server timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    this.peerJsConnection.on(PeerEventType.Error, async (err) => {
      if (result.isPending) {
        return result.reject(err);
      }
    });

    this.peerJsConnection.on(PeerEventType.Valid, () => result.isPending && result.resolve());

    return result;
  }

  private async retryConnection() {
    const layer = this.currentLayer;
    const rooms = this.currentRooms.slice();

    const { reconnectionAttempts, backoffMs } = this.config;

    for (let i = 1; ; ++i) {
      if (this.disposed) return;

      this.log(LogLevel.DEBUG, `Connection attempt `, i);
      // To avoid synced retries, we use a random delay
      await delay(backoffMs! + Math.floor(Math.random() * backoffMs!));

      try {
        this.setLighthouseUrl(this.lighthouseUrl(), false);
        await this.awaitConnectionEstablished();

        if (layer) {
          await this.setLayer(layer);
          for (const room of rooms) {
            await this.joinRoom(room.id);
          }
        }

        this.addRetryListenerToConnection();

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
    const id = this.peerIdOrFail();
    const { json } = await this.httpClient.fetch(`/layers/${layer}`, {
      method: "PUT",
      // userId and peerId are deprecated but we leave them here for compatibility. When all lighthouses are safely updated they should be removed
      bodyObject: { id, userId: id, peerId: id, protocolVersion: PROTOCOL_VERSION },
    });

    const layerUsers: PeerResponse[] = json;

    this.currentLayer = layer;
    this.cleanStateAndConnections();
    this.updateKnownPeers(layerUsers.map((it) => ({ id: (it.id ?? it.userId)!, position: it.position })));

    //@ts-ignore
    const ignored = this.updateNetwork();
  }

  private cleanStateAndConnections() {
    this.currentRooms.length = 0;
    this.knownPeers = {};
    Object.keys(this.connectedPeers).forEach((it) => this.disconnectFrom(it));
  }

  async joinRoom(roomId: string): Promise<any> {
    if (this.disposed) return;
    this.assertPeerInLayer();

    let room = this.findRoom(roomId);

    if (!room) {
      room = {
        id: roomId,
        users: [] as string[],
      };
      this.currentRooms.push(room);
    } else {
      room.users = [];
    }

    const id = this.peerIdOrFail();
    const { json } = await this.httpClient.fetch(`/layers/${this.currentLayer}/rooms/${roomId}`, {
      method: "PUT",
      // userId and peerId are deprecated but we leave them here for compatibility. When all lighthouses are safely updated they should be removed
      bodyObject: { id, userId: id, peerId: id },
    });

    const roomUsers: PeerResponse[] = json;

    room.users = roomUsers.map((it) => (it.id ?? it.userId)!);

    this.updateKnownPeers(roomUsers.map((it) => ({ id: (it.id ?? it.userId)!, position: it.position })));

    await this.updateNetwork();
    return await this.roomConnectionHealthy(roomId);
  }

  private updateKnownPeers(newPeers: MinPeerData[]) {
    //We don't need to remove existing peers since they will eventually expire

    newPeers.forEach((peer) => {
      if (peer.id !== this.peerId) {
        this.addKnownPeerIfNotExists(peer);
        if (peer.position) {
          this.setPeerPositionIfExistingPositionIsOld(peer.id, peer.position);
        }
      }
    });
  }

  private addKnownPeerIfNotExists(peer: MinPeerData) {
    if (!this.knownPeers[peer.id]) {
      this.knownPeers[peer.id] = { ...peer, subtypeData: {}, reachableThrough: {} };
    }

    return this.knownPeers[peer.id];
  }

  private ensureAndUpdateKnownPeer(packet: Packet, connectedPeerId: string) {
    const minPeerData = { id: packet.src };
    this.addKnownPeerIfNotExists(minPeerData);

    this.knownPeers[packet.src].reachableThrough[connectedPeerId] = { id: connectedPeerId, hops: packet.hops + 1, timestamp: Date.now() };

    if (packet.messageData?.room) {
      this.addUserToRoom(packet.messageData.room, minPeerData);
    }
  }

  private removeKnownPeer(peerId: string) {
    delete this.knownPeers[peerId];
    this.currentRooms.forEach((it) => this.removeUserFromRoom(it.id, peerId));
  }

  async roomConnectionHealthy(roomId: string) {
    // - Send ping to each member of the room
    // - Await responses. Once responces amount reach a certain threshold, assume healthy
    // - If not healthy after 5 seconds (or configurable amount) and if max connections are not reached, establish connection with more peers
    // - If after additional connections still not healthy, fail

    return true;
  }

  calculateConnectionCandidates() {
    return Object.keys(this.knownPeers).filter((key) => !this.hasConnectionsFor(key));
  }

  async updateNetwork() {
    if (this.updatingNetwork || this.disposed) {
      return;
    }

    try {
      this.updatingNetwork = true;

      this.log(LogLevel.DEBUG, "Updating network...");

      this.checkConnectionsSanity();

      let connectionCandidates = Object.values(this.knownPeers).filter((it) => this.isValidConnectionCandidate(it));

      let operation: NetworkOperation | undefined;
      while ((operation = this.calculateNextNetworkOperation(connectionCandidates))) {
        try {
          connectionCandidates = await operation();
        } catch (e) {
          // We may want to invalidate the operation or something to avoid repeating the same mistake
          this.log(LogLevel.DEBUG, "Error performing operation", operation, e);
        }
      }
    } finally {
      this.log(LogLevel.DEBUG, "Network update finished");

      this.updatingNetwork = false;
    }
  }

  private isValidConnectionCandidate(it: KnownPeerData): boolean {
    return !this.isConnectedTo(it.id) && (!this.config.positionConfig?.maxConnectionDistance || this.isValidConnectionByDistance(it) || this.isValidConnectionByRooms(it));
  }

  private isValidConnectionByDistance(peer: KnownPeerData) {
    const distance = this.distanceTo(peer.id);
    return typeof distance !== "undefined" && distance <= this.config.positionConfig!.maxConnectionDistance!;
  }

  private isValidConnectionByRooms(peer: KnownPeerData): boolean {
    return this.currentRooms.some((room) => room.users.includes(peer.id));
  }

  private checkConnectionsSanity() {
    //Since there may be flows that leave connections that are actually lost, we check if relatively
    //old connections are not connected and discard them.
    Object.keys(this.connectedPeers).forEach((it) => {
      if (!this.isConnectedTo(it) && Date.now() - this.connectedPeers[it].createTimestamp > this.config.oldConnectionsTimeout!) {
        this.log(LogLevel.WARN, `The connection to ${it} is not in a sane state. Discarding it.`);
        this.disconnectFrom(it, false);
      }
    });
  }

  private calculateNextNetworkOperation(connectionCandidates: KnownPeerData[]): NetworkOperation | undefined {
    this.log(LogLevel.DEBUG, "Calculating network operation with candidates", connectionCandidates);

    const peerSortCriteria = (peer1: KnownPeerData, peer2: KnownPeerData) => {
      if (this.config.positionConfig) {
        // We prefer those peers that have position over those that don't
        if (peer1.position && !peer2.position) return -1;
        if (peer2.position && !peer1.position) return 1;

        if (peer1.position && peer2.position) {
          const distanceDiff = this.distanceTo(peer1.id)! - this.distanceTo(peer2.id)!;
          // If the distance is the same, we randomize
          return distanceDiff === 0 ? 0.5 - Math.random() : distanceDiff;
        }
      }

      // If none has position or if we don't, we randomize
      return 0.5 - Math.random();
    };

    const pickCandidates = (count: number) => {
      if (!this.config.positionConfig) return pickRandom(connectionCandidates, count);

      // We are going to be calculating the distance to each of the candidates. This could be costly, but since the state could have changed after every operation,
      // we need to ensure that the value is updated. If known peers is kept under maybe 2k elements, it should be no problem.
      return pickBy(connectionCandidates, count, peerSortCriteria);
    };

    const neededConnections = this.config.targetConnections! - this.connectedCount();

    // If we need to establish new connections because we are below the target, we do that
    if (neededConnections > 0 && connectionCandidates.length > 0) {
      this.log(LogLevel.DEBUG, "Establishing connections to reach target");
      return async () => {
        const [candidates, remaining] = pickCandidates(neededConnections);

        this.log(LogLevel.DEBUG, "Picked connection candidates", candidates);

        await Promise.all(candidates.map((candidate) => this.connectTo(candidate).catch((e) => this.log(LogLevel.DEBUG, "Error connecting to candidate", candidate, e))));
        return remaining;
      };
    }

    // If we are over the max amount of connections, we discard the "worst"
    const toDisconnect = this.connectedCount() - this.config.maxConnections!;

    if (toDisconnect > 0) {
      this.log(LogLevel.DEBUG, "Too many connections. Need to disconnect from: " + toDisconnect);
      return async () => {
        Object.values(this.knownPeers)
          .filter((peer) => this.isConnectedTo(peer.id))
          // We sort the connected peer by the opposite criteria
          .sort((peer1, peer2) => -peerSortCriteria(peer1, peer2))
          .slice(0, toDisconnect)
          .forEach((peer) => this.disconnectFrom(peer.id));
        return connectionCandidates;
      };
    }

    // If we have positionConfig, we try to find a better connection than any of the established
    if (this.config.positionConfig && connectionCandidates.length > 0) {
      // We find the worst distance of the current connections
      const worstPeer = this.getWorstConnectedPeerByDistance();

      const sortedCandidates = connectionCandidates.sort(peerSortCriteria);
      // We find the best candidate
      const bestCandidate = sortedCandidates.splice(0, 1)[0];

      if (bestCandidate) {
        const bestCandidateDistance = this.distanceTo(bestCandidate.id);

        if (typeof bestCandidateDistance !== "undefined" && (!worstPeer || bestCandidateDistance < worstPeer[0])) {
          // If the best candidate is better than the worst connection, we connect to that candidate.
          // The next operation should handle the disconnection of the worst
          this.log(LogLevel.DEBUG, "Found a better candidate for connection: ", { candidate: bestCandidate, distance: bestCandidateDistance, replacing: worstPeer });
          return async () => {
            await this.connectTo(bestCandidate);
            return sortedCandidates;
          };
        }
      }
    }

    // We drop those connections too far away
    if (this.config.positionConfig?.disconnectDistance) {
      const connectionsToDrop = Object.keys(this.connectedPeers).filter((it) => {
        const distance = this.distanceTo(it);
        // We need to check that we are actually connected to the peer, and also only disconnect to it if we know we are far away and we don't have any rooms in common
        return this.isConnectedTo(it) && distance && distance >= this.config.positionConfig!.disconnectDistance! && !this.isValidConnectionByRooms(this.knownPeers[it]);
      });

      if (connectionsToDrop.length > 0) {
        this.log(LogLevel.DEBUG, "Dropping connections because they are too far away and don't have rooms in common: ", connectionsToDrop);
        return async () => {
          connectionsToDrop.forEach((it) => this.disconnectFrom(it));
          return connectionCandidates;
        };
      }
    }
  }

  private getWorstConnectedPeerByDistance(): [number, string] | undefined {
    return Object.keys(this.connectedPeers).reduce<[number, string] | undefined>((currentWorst, peer) => {
      const currentDistance = this.distanceTo(peer);
      if (typeof currentDistance !== "undefined") {
        return typeof currentWorst !== "undefined" && currentWorst[0] >= currentDistance ? currentWorst : [currentDistance, peer];
      }
    }, undefined);
  }

  public selfPosition() {
    return this.config.positionConfig?.selfPosition();
  }

  private distanceTo(peerId: string) {
    const position = this.selfPosition();
    if (this.knownPeers[peerId]?.position && position) {
      return this.config.positionConfig?.distance!(position, this.knownPeers[peerId].position!);
    }
  }

  connectedCount() {
    return this.fullyConnectedPeerIds().length;
  }

  fullyConnectedPeerIds() {
    return Object.keys(this.connectedPeers).filter((it) => this.isConnectedTo(it));
  }

  async connectTo(known: KnownPeerData) {
    const peer = this.createPeerConnection(known.id, util.generateToken(16), true);

    return this.beConnectedTo(peer.id, this.config.peerConnectTimeout).catch((e) => {
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

    await this.httpClient.fetch(`/layers/${this.currentLayer}/rooms/${roomId}/users/${encodeURI(this.peerIdOrFail())}`, { method: "DELETE" });

    const index = this.currentRooms.findIndex((room) => room.id === roomId);

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
        } else {
          resolve();
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

  setPeerPosition(peerId: string, position: Position) {
    if (this.knownPeers[peerId]) {
      this.knownPeers[peerId].position = position;
    }
  }

  setPeerPositionIfExistingPositionIsOld(peerId: string, position: Position) {
    const timestamp = this.knownPeers[peerId]?.timestamp;
    if (this.knownPeers[peerId] && (!timestamp || Date.now() - timestamp > 30000)) {
      // We assume that if we haven't received a position from a peer in 30 seconds,
      // then we can safely replace the position even if it is not the most updated
      this.knownPeers[peerId].position = position;
    }
  }

  private hasConnectionsFor(peerId: string) {
    return !!this.connectedPeers[peerId];
  }

  private hasInitiatedConnectionFor(peerId: string) {
    return this.hasConnectionsFor(peerId) && this.connectedPeers[peerId].initiator;
  }

  public isConnectedTo(peerId: string): boolean {
    return (
      //@ts-ignore The `connected` property is not typed but it seems to be public
      this.connectedPeers[peerId] && this.connectedPeers[peerId].connection.connected
    );
  }

  private findRoom(id: string) {
    return this.currentRooms.find(($) => $.id === id);
  }

  private subscribeToConnection(peerData: ConnectedPeerData, connection: SimplePeer.Instance) {
    connection.on("signal", this.handleSignal(peerData));
    connection.on("close", () => this.handleDisconnection(peerData));
    connection.on("connect", () => this.handleConnection(peerData));

    connection.on("error", (err) => {
      this.log(LogLevel.ERROR, "error in peer connection " + connectionIdFor(this.peerIdOrFail(), peerData.id, peerData.sessionId), err);
      connection.removeAllListeners();
      connection.destroy();
      this.handleDisconnection(peerData);
    });

    connection.on("data", (data) => this.handlePeerPacket(data, peerData.id));
  }

  private updateTimeStamp(peerId: string, subtype: string | undefined, timestamp: number, sequenceId: number) {
    const knownPeer = this.knownPeers[peerId];
    knownPeer.timestamp = Math.max(knownPeer.timestamp ?? Number.MIN_SAFE_INTEGER, timestamp);
    if (subtype) {
      const lastData = knownPeer.subtypeData[subtype];
      knownPeer.subtypeData[subtype] = {
        lastTimestamp: Math.max(lastData?.lastTimestamp ?? Number.MIN_SAFE_INTEGER, timestamp),
        lastSequenceId: Math.max(lastData?.lastSequenceId ?? Number.MIN_SAFE_INTEGER, sequenceId),
      };
    }
  }

  private handlePeerPacket(data: Uint8Array, peerId: string) {
    if (this.disposed) return;
    try {
      const packet = Packet.decode(Reader.create(data));

      const alreadyReceived = !!this.receivedPackets[this.packetKey(packet)];

      this.ensureAndUpdateKnownPeer(packet, peerId);

      if (packet.discardOlderThan !== 0) {
        //If discardOlderThan is zero, then we don't need to store the package.
        //Same or older packages will be instantly discarded
        this.markReceived(packet);
      }

      const expired = this.checkExpired(packet);

      this.stats.countPacket(packet, data.length, "received", this.getTagsForPacket(alreadyReceived, expired, packet));

      if (packet.hops >= 1) {
        this.countRelay(peerId, packet, expired, alreadyReceived);
      }

      if (!alreadyReceived && !expired) {
        this.updateTimeStamp(packet.src, packet.subtype, packet.timestamp, packet.sequenceId);

        packet.hops += 1;

        this.knownPeers[packet.src].hops = packet.hops;

        if (packet.hops < packet.ttl) {
          this.sendPacket(packet);
        }

        const messageData = packet.messageData;
        if (messageData) {
          if (this.isInRoom(messageData.room)) {
            this.callback(packet.src, messageData.room, this.decodePayload(messageData.payload, messageData.encoding));
          }
        }

        const pingData = packet.pingData;
        if (pingData) {
          this.respondPing(pingData.pingId);
        }

        const pongData = packet.pongData;
        if (pongData) {
          this.processPong(packet.src, pongData.pingId);
        }

        const suspendRelayData = packet.suspendRelayData;
        if (suspendRelayData) {
          this.processSuspensionRequest(packet.src, suspendRelayData);
        }
      } else {
        this.requestRelaySuspension(packet, peerId);
      }
    } catch (e) {
      this.log(LogLevel.WARN, "Failed to process message from: " + peerId, e);
      return;
    }
  }

  private processSuspensionRequest(peerId: string, suspendRelayData: SuspendRelayData) {
    const connectedPeer = this.connectedPeers[peerId];
    if (connectedPeer) {
      suspendRelayData.relayedPeers.forEach((it) => (connectedPeer.ownSuspendedRelays[it] = Date.now() + suspendRelayData.durationMillis));
    }
  }

  private requestRelaySuspension(packet: Packet, peerId: string) {
    const suspensionConfig = this.config.relaySuspensionConfig;
    if (suspensionConfig) {
      // First we update pending suspensions requests, adding the new one if needed
      this.consolidateSuspensionRequest(packet, peerId);

      const now = Date.now();

      const connected = this.connectedPeers[peerId];

      const lastSuspension = connected.lastRelaySuspensionTimestamp;

      // We only send suspensions requests if more time than the configured interval has passed since last time
      if (lastSuspension && now - lastSuspension > suspensionConfig.relaySuspensionInterval) {
        const suspendRelayData: SuspendRelayData = {
          relayedPeers: connected.pendingSuspensionRequests,
          durationMillis: suspensionConfig.relaySuspensionDuration,
        };

        this.log(LogLevel.DEBUG, `Requesting relay suspension to ${peerId}`, suspendRelayData);

        const packet = this.buildPacketWithData(SuspendRelayType, { suspendRelayData });

        this.sendPacketToPeer(connected.id, packet);

        suspendRelayData.relayedPeers.forEach((relayedPeerId) => {
          connected.theirSuspendedRelays[relayedPeerId] = Date.now() + suspensionConfig.relaySuspensionDuration;
        });

        connected.pendingSuspensionRequests = [];
        connected.lastRelaySuspensionTimestamp = now;
      } else if (!lastSuspension) {
        // We skip the first suspension to give time to populate the structures
        connected.lastRelaySuspensionTimestamp = now;
      }
    }
  }

  private consolidateSuspensionRequest(packet: Packet, connectedPeerId: string) {
    if (this.connectedPeers[connectedPeerId].pendingSuspensionRequests.includes(packet.src)) {
      // If there is already a pending suspension for this src through this connection, we don't do anything
      return;
    }

    this.log(LogLevel.DEBUG, `Consolidating suspension for ${packet.src}->${connectedPeerId}`);

    const now = Date.now();

    // We get a list of through which connected peers is this src reachable and are not suspended
    const reachableThrough = Object.values(this.knownPeers[packet.src].reachableThrough).filter(
      (it) => this.isConnectedTo(it.id) && now - it.timestamp < KNOWN_PEER_RELAY_EXPIRE_TIME && !this.isRelayFromConnectionSuspended(it.id, packet.src, now)
    );

    this.log(LogLevel.DEBUG, `${packet.src} is reachable through`, reachableThrough);

    // We only suspend if we will have at least 1 path of connection for this peer after suspensions
    if (reachableThrough.length > 1 || (reachableThrough.length === 1 && reachableThrough[0].id !== connectedPeerId)) {
      this.log(LogLevel.DEBUG, `Will add suspension for ${packet.src}->${connectedPeerId}`);
      this.connectedPeers[connectedPeerId].pendingSuspensionRequests.push(packet.src);
    }
  }

  private isRelayFromConnectionSuspended(connectedPeerId: string, srcId: string, now: number = Date.now()) {
    const connectedPeer = this.connectedPeers[connectedPeerId];
    return (
      connectedPeer &&
      (connectedPeer.pendingSuspensionRequests.includes(srcId) ||
        // Relays are suspended only if they are not expired
        (connectedPeer.theirSuspendedRelays[srcId] && now < connectedPeer.theirSuspendedRelays[srcId]))
    );
  }

  private isRelayToConnectionSuspended(connectedPeerId: string, srcId: string, now: number = Date.now()) {
    const connectedPeer = this.connectedPeers[connectedPeerId];
    return connectedPeer && connectedPeer.ownSuspendedRelays[srcId] && now < connectedPeer.ownSuspendedRelays[srcId];
  }

  private countRelay(peerId: string, packet: Packet, expired: boolean, alreadyReceived: boolean) {
    let relayData = this.connectedPeers[peerId].receivedRelayData[packet.src];
    if (!relayData) {
      relayData = this.connectedPeers[peerId].receivedRelayData[packet.src] = {
        hops: packet.hops,
        discarded: 0,
        total: 0,
      };
    } else {
      relayData.hops = packet.hops;
    }

    relayData.total += 1;

    if (expired || alreadyReceived) {
      relayData.discarded += 1;
    }
  }

  private getTagsForPacket(alreadyReceived: boolean, expired: boolean, packet: Packet) {
    const tags: string[] = [];
    if (alreadyReceived) {
      tags.push("duplicate");
    }
    if (expired) {
      tags.push("expired");
    }
    if (!packet.messageData || this.isInRoom(packet.messageData.room)) {
      tags.push("relevant");
    }
    return tags;
  }

  private processPong(peerId: string, pingId: number) {
    const now = performance.now();
    const activePing = this.activePings[pingId];
    if (activePing && activePing.startTime) {
      const elapsed = now - activePing.startTime;

      const knownPeer = this.addKnownPeerIfNotExists({ id: peerId });
      knownPeer.latency = elapsed;

      activePing.results.push({ peerId, latency: elapsed });
    }
  }

  private respondPing(pingId: number) {
    const pongData: PongData = { pingId };

    // TODO: Maybe we should add a destination and handle this message as unicast
    this.sendPacketWithData({ pongData }, PongMessageType, { expireTime: this.getPingTimeout() });
  }

  private decodePayload(payload: Uint8Array, encoding: number): any {
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
    const discardedByOlderThan: boolean = this.isDiscardedByOlderThanReceivedPackages(packet);

    let discardedByExpireTime: boolean = false;
    const expireTime = this.getExpireTime(packet);

    if (this.knownPeers[packet.src].timestamp) {
      discardedByExpireTime = this.knownPeers[packet.src].timestamp! - packet.timestamp > expireTime;
    }

    return discardedByOlderThan || discardedByExpireTime;
  }

  private isDiscardedByOlderThanReceivedPackages(packet: Packet) {
    if (packet.discardOlderThan >= 0 && packet.subtype) {
      const subtypeData = this.knownPeers[packet.src]?.subtypeData[packet.subtype];
      return subtypeData && subtypeData.lastTimestamp - packet.timestamp > packet.discardOlderThan && subtypeData.lastSequenceId >= packet.sequenceId;
    }

    return false;
  }

  private isInRoom(room: string) {
    return this.currentRooms.some((it) => it.id === room);
  }

  private handleDisconnection(peerData: ConnectedPeerData) {
    this.log(LogLevel.INFO, "DISCONNECTED from " + peerData.id + " through " + connectionIdFor(this.peerIdOrFail(), peerData.id, peerData.sessionId));
    // TODO - maybe add a callback for the client to know that a peer has been disconnected, also might need to handle connection errors - moliva - 16/12/2019
    if (this.connectedPeers[peerData.id]) {
      delete this.connectedPeers[peerData.id];
    }

    if (this.peerConnectionPromises[peerData.id]) {
      this.peerConnectionPromises[peerData.id].forEach((it) => it.reject());
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

  private handleConnection(peerData: ConnectedPeerData) {
    this.log(LogLevel.INFO, "CONNECTED to " + peerData.id + " through " + connectionIdFor(this.peerIdOrFail(), peerData.id, peerData.sessionId));

    this.peerConnectionPromises[peerData.id]?.forEach(($) => $.resolve());
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
    const room = this.currentRooms.find((_room) => _room.id === roomId);
    if (!room) {
      return Promise.reject(new Error(`cannot send a message in a room not joined (${roomId})`));
    }

    const [encoding, encodedPayload] = this.getEncodedPayload(payload);

    const messageData: MessageData = {
      room: roomId,
      encoding,
      payload: encodedPayload,
      dst: [],
    };

    return this.sendPacketWithData({ messageData }, type);
  }

  private sendPacketWithData(data: PacketData, type: PeerMessageType, packetProperties: Partial<Packet> = {}) {
    const packet: Packet = this.buildPacketWithData(type, data, packetProperties);

    this.sendPacket(packet);

    return Promise.resolve();
  }

  private buildPacketWithData(type: PeerMessageType, data: PacketData, packetProperties: Partial<Packet> = {}) {
    const sequenceId = this.generateMessageId();
    const packet: Packet = {
      sequenceId,
      instanceId: this.instanceId,
      subtype: type.name,
      expireTime: type.expirationTime ?? -1,
      discardOlderThan: type.discardOlderThan ?? -1,
      timestamp: new Date().getTime(),
      src: this.peerIdOrFail(),
      hops: 0,
      ttl: this.getTTL(sequenceId, type),
      receivedBy: [],
      optimistic: this.getOptimistic(sequenceId, type),
      pingData: undefined,
      pongData: undefined,
      suspendRelayData: undefined,
      messageData: undefined,
      ...data,
      ...packetProperties,
    };
    return packet;
  }

  async ping() {
    const pingId = randomUint32();
    const pingFuture = future<PingResult[]>();
    this.activePings[pingId] = {
      results: [],
      future: pingFuture,
    };

    await this.sendPacketWithData({ pingData: { pingId } }, PingMessageType, { expireTime: this.getPingTimeout() });

    setTimeout(() => {
      const activePing = this.activePings[pingId];
      if (activePing) {
        activePing.future.resolve(activePing.results);
        delete this.activePings[pingId];
      }
    }, this.getPingTimeout());

    return await pingFuture;
  }

  private getPingTimeout() {
    return this.config.pingTimeout ?? 7000;
  }

  getTTL(index: number, type: PeerMessageType) {
    return typeof type.ttl !== "undefined" ? (typeof type.ttl === "number" ? type.ttl : type.ttl(index, type)) : 10;
  }

  getOptimistic(index: number, type: PeerMessageType) {
    return typeof type.optimistic === "boolean" ? type.optimistic : type.optimistic(index, type);
  }

  private sendPacket(packet: Packet) {
    const id = this.peerIdOrFail();

    if (!packet.receivedBy.includes(id)) packet.receivedBy.push(this.peerIdOrFail());

    const peersToSend = Object.keys(this.connectedPeers).filter(
      (it) => !packet.receivedBy.includes(it) && (packet.hops === 0 || !this.isRelayToConnectionSuspended(it, packet.src))
    );

    if (packet.optimistic) {
      //We only add those connected peers that the connection actually informs as connected
      const fullyConnectedToSend = peersToSend.filter((it) => this.fullyConnectedPeerIds().includes(it));
      packet.receivedBy = [...packet.receivedBy, ...fullyConnectedToSend];
    }

    // This is a little specific also, but is here in order to make the measurement as accurate as possible
    if (packet.pingData && packet.src === this.peerId) {
      const activePing = this.activePings[packet.pingData.pingId];
      if (activePing) {
        activePing.startTime = performance.now();
      }
    }

    peersToSend.forEach((peer) => this.sendPacketToPeer(peer, packet));
  }

  private sendPacketToPeer(peer: string, packet: Packet) {
    const conn = this.connectedPeers[peer].connection;
    if (this.isConnectedTo(peer)) {
      try {
        const data = Packet.encode(packet).finish();
        conn.send(data);
        this.stats.countPacket(packet, data.length, packet.hops === 0 ? "sent" : "relayed");
      } catch (e) {
        this.log(LogLevel.WARN, "Error sending data to peer " + peer, e);
      }
    }
  }

  private handleSignal(peerData: ConnectedPeerData) {
    const connectionId = connectionIdFor(this.peerIdOrFail(), peerData.id, peerData.sessionId);
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
            layer: this.currentLayer,
            position: this.selfPosition(),
          });
        } else if (data.type === PeerSignals.answer) {
          this.peerJsConnection.sendAnswer(peerData, {
            sdp: data,
            sessionId: peerData.sessionId,
            connectionId,
            protocolVersion: PROTOCOL_VERSION,
            lighthouseUrl: this.lighthouseUrl(),
            layer: this.currentLayer,
            position: this.selfPosition(),
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

  private createPeerConnection(peerId: string, sessionId: string, initiator: boolean): ConnectedPeerData {
    const peer = (this.connectedPeers[peerId] = {
      id: peerId,
      sessionId,
      initiator,
      ownSuspendedRelays: {},
      theirSuspendedRelays: {},
      receivedRelayData: {},
      pendingSuspensionRequests: [],
      createTimestamp: new Date().getTime(),
      connection: new SimplePeer({
        initiator,
        config: this.connectionConfig,
        channelConfig: {
          label: connectionIdFor(this.peerIdOrFail(), peerId, sessionId),
        },
        wrtc: this.wrtc,
        objectMode: true,
      }),
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
            if (payload.position && this.selfPosition()) {
              const knownPeer = this.addKnownPeerIfNotExists({ id: peerId });
              knownPeer.timestamp = Date.now();
              knownPeer.position = payload.position;

              const worstPeer = this.getWorstConnectedPeerByDistance();
              if (worstPeer && this.distanceTo(peerId)! > worstPeer[0]) {
                // If the new peer distance is worse than the worst peer distance we have, we reject it
                this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, "TOO_MANY_CONNECTIONS");
                break;
              } else {
                // We are going to be over connected so we trigger a delayed network update to ensure we keep below the max connections
                setTimeout(() => this.updateNetwork(), 500);
              }
            } else {
              // We also reject if there is no position configuration
              this.peerJsConnection.sendRejection(peerId, payload.sessionId, payload.label, "TOO_MANY_CONNECTIONS");
              break;
            }
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
            candidate: payload.candidate,
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
            this.addKnownPeerIfNotExists({ id: id ?? userId });
          }
          break;
        }
        case ServerMessageType.OptimalNetworkResponse: {
          if (payload) {
            const { layerId, optimalConnections } = payload;

            if (this.currentLayer === layerId) {
              this.processOptimalConnectionsResponse(optimalConnections);
            }
          }
          break;
        }
      }
    }
  }

  private processOptimalConnectionsResponse(optimalConnections: PeerConnectionHint[]) {
    const now = Date.now();
    optimalConnections.forEach((it) => {
      this.addKnownPeerIfNotExists(it);

      this.knownPeers[it.id].position = it.position;
      this.knownPeers[it.id].timestamp = now;
    });

    this.updateNetwork().catch((e) => this.log(LogLevel.WARN, "Error updating network for optimization", e));
  }

  private removeUserFromRoom(roomId: string, peerId: string) {
    const room = this.findRoom(roomId);
    if (room) {
      const userIndex = room.users.indexOf(peerId);
      if (userIndex >= 0) room.users.splice(userIndex, 1);
    }
  }

  private addUserToRoom(roomId: string, peerData: MinPeerData) {
    this.addKnownPeerIfNotExists(peerData);

    const room = this.findRoom(roomId);
    if (room && !room.users.includes(peerData.id)) {
      room.users.push(peerData.id);
    }
  }

  private checkForCrossOffers(peerId: string, sessionId?: string) {
    const isCrossOfferToBeDiscarded = this.hasInitiatedConnectionFor(peerId) && (!sessionId || this.connectedPeers[peerId].sessionId !== sessionId) && this.peerIdOrFail() < peerId;
    if (isCrossOfferToBeDiscarded) {
      this.log(LogLevel.WARN, "Received offer/candidate for already existing peer but it was discarded: " + peerId);
    }

    return isCrossOfferToBeDiscarded;
  }

  private setUpTimeToRequestOptimumNetwork() {
    this.timeToRequestOptimumNetwork = Date.now() + (this.config.optimizeNetworkInterval ?? 30000);
  }

  async dispose() {
    this.disposed = true;
    clearTimeout(this.expireTimeoutId as any);
    clearTimeout(this.pingTimeoutId as any);
    this.stats.dispose();
    this.cleanStateAndConnections();
    return new Promise<void>((resolve, reject) => {
      if (this.peerJsConnection && !this.peerJsConnection.disconnected) {
        this.peerJsConnection.once(PeerEventType.Disconnected, resolve);
        this.peerJsConnection
          .disconnect()
          .then(() => resolve())
          .catch((e) => reject(e));
      } else {
        resolve();
      }
    });
  }
}
