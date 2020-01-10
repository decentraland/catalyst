import { PeerJSServerConnection } from "./peerjs-server-connector/peerjsserverconnection";
import { ServerMessage } from "./peerjs-server-connector/servermessage";
import { ServerMessageType } from "./peerjs-server-connector/enums";
import SimplePeer, { SignalData } from "simple-peer";
import { isReliable, connectionIdFor, util } from "./peerjs-server-connector/util";
import { SocketBuilder } from "./peerjs-server-connector/socket";
import { PeerConnectionData, IPeer, Room } from "./types";
import { PeerHttpClient } from "./PeerHttpClient";

const PROTOCOL_VERSION = 1;

interface PacketData {
  hi: { room: { id: string; users: PeerConnectionData[] } };
  message: { room: string; src: string; dst: string; payload: any; hops?: number; ttl?: number };
}

type PacketType = keyof PacketData;
type Packet<T extends PacketType> = {
  type: T;
  data: PacketData[T];
};

export type PeerData = {
  id: string;
  sessionId: string;
  initiator: boolean;
  reliableConnection: SimplePeer.Instance;
  // unreliableConnection: SimplePeer.Instance;
};

const PeerSignals = { offer: "offer", answer: "answer" };

function signalMessage(peer: PeerData, connectionId: string, signal: SignalData) {
  if (isReliable(connectionId)) {
    peer.reliableConnection.signal(signal);
    // } else {
    // peer.unreliableConnection.signal(signal);
  }
}

export enum RelayMode {
  None,
  All
}

type PeerConfig = {
  connectionConfig?: any;
  wrtc?: any;
  socketBuilder?: SocketBuilder;
  token?: string;
  sessionId?: string;
  relay?: RelayMode;
};

export type PacketCallback = (sender: string, room: string, payload: any) => void;

export class Peer implements IPeer {
  private peerJsConnection: PeerJSServerConnection;
  private connectedPeers: Record<string, PeerData> = {};

  private peerConnectionPromises: Record<string, { resolve: () => void; reject: () => void }[]> = {};

  private currentLayer?: string;

  //@ts-ignore
  private layerPeers: PeerConnectionData[];

  public readonly currentRooms: Room[] = [];
  private connectionConfig: any;
  private wrtc: any;
  private httpClient: PeerHttpClient;

  constructor(lighthouseUrl: string, public nickname: string, public callback: PacketCallback = () => {}, private config: PeerConfig = { relay: RelayMode.None }) {
    const url = new URL(lighthouseUrl);

    this.config.token = this.config.token ?? util.randomToken();

    const secure = url.protocol === "https:";

    this.httpClient = new PeerHttpClient(lighthouseUrl, () => this.config.token!);

    this.peerJsConnection = new PeerJSServerConnection(this, nickname, {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : secure ? 443 : 80,
      path: url.pathname,
      secure,
      token: this.config.token,
      ...(config.socketBuilder ? { socketBuilder: config.socketBuilder } : {})
    });

    this.wrtc = config.wrtc;

    this.connectionConfig = {
      ...(config.connectionConfig || {})
    };
  }

  log(...entries: any[]) {
    console.log(`[PEER: ${this.nickname}]`, ...entries);
  }

  async setLayer(layer: string): Promise<void> {
    const { json } = await this.httpClient.fetch(`/layers/${layer}`, {
      method: "PUT",
      bodyObject: { userId: this.nickname, peerId: this.nickname }
    });

    this.currentLayer = layer;
    this.layerPeers = json;
  }

  async joinRoom(roomId: string): Promise<any> {
    this.assertPeerInLayer();

    const { json } = await this.httpClient.fetch(`/layers/${this.currentLayer}/rooms/${roomId}`, {
      method: "PUT",
      bodyObject: { userId: this.nickname, peerId: this.nickname }
    });

    const roomUsers: PeerConnectionData[] = json;

    const room = {
      id: roomId,
      users: new Map(roomUsers.map(data => [this.key(data), data]))
    };
    this.currentRooms.push(room);

    return Promise.all(
      roomUsers
        .filter(user => user.userId !== this.nickname)
        .map(user => {
          if (!this.hasConnectionsFor(user.peerId) && user.peerId !== this.nickname) {
            this.getOrCreatePeer(user.peerId, true, roomId);
          }
          this.sendPacket(user, {
            type: "hi",
            data: { room: { id: room.id, users: [...room.users.values()] } }
          });

          return this.beConnectedTo(user.peerId);
        })
    );
  }

  private assertPeerInLayer() {
    if (!this.currentLayer) throw new Error("Peer needs to have joined a layer to operate with rooms");
  }

  async leaveRoom(roomId: string) {
    this.assertPeerInLayer();

    const response = await this.httpClient.fetch(`layers/${this.currentLayer}/rooms/${roomId}/users/${this.nickname}`, { method: "DELETE" });

    const roomUsers: PeerConnectionData[] = await response.json();

    const index = this.currentRooms.findIndex(room => room.id === roomId);

    if (index === -1) {
      // not in room -> do nothing
      return Promise.resolve();
    }

    this.currentRooms.splice(index, 1);

    roomUsers.forEach(user => {
      const peer = this.connectedPeers[user.peerId];

      if (peer && !this.sharesRoomWith(peer.id)) {
        peer.reliableConnection.once("close", () => {
          delete this.connectedPeers[user.peerId];
        });
        peer.reliableConnection.destroy();
      }
    });
  }

  private sharesRoomWith(peerId: string) {
    return this.currentRooms.some(room => [...room.users.values()].some(user => user.peerId === peerId));
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
        if (!this.isConnectedTo(peerId)) {
          reject(new Error(`[${this.nickname}] Awaiting connection to peer ${peerId} timed out after ${timeout}ms`));
          this.peerConnectionPromises[peerId] = this.peerConnectionPromises[peerId].splice(this.peerConnectionPromises[peerId].indexOf(promisePair), 1);
        }
      }, timeout);
    });
  }

  public disconnectFrom(peerId: string) {
    if (this.connectedPeers[peerId]) {
      this.log("[PEER] Disconnecting from " + peerId);
      this.connectedPeers[peerId].reliableConnection.destroy();
      delete this.connectedPeers[peerId];
    } else {
      this.log("[PEER] Already not connected to peer " + peerId);
    }
  }

  private key(data: PeerConnectionData) {
    return `${data.userId}:${data.peerId}`;
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
      this.connectedPeers[peerId] && this.connectedPeers[peerId].reliableConnection.connected
    );
  }

  private findRoom(id: string) {
    return this.currentRooms.find($ => $.id === id);
  }

  private subscribeToConnection(peerData: PeerData, connection: SimplePeer.Instance, reliable: boolean) {
    connection.on("signal", this.handleSignal(peerData, reliable));
    connection.on("close", () => this.handleDisconnection(peerData, reliable));
    connection.on("connect", () => this.handleConnection(peerData, reliable));

    connection.on("error", err => {
      this.log("error in peer connection " + connectionIdFor(this.nickname, peerData.id, peerData.sessionId, reliable), err);
      connection.removeAllListeners();
      connection.destroy();
      this.handleDisconnection(peerData, reliable);
    });

    connection.on("data", data => this.handlePeerPacket(data, peerData.id));
  }

  private handlePeerPacket(data: string, peerId: string) {
    const parsed = JSON.parse(data);
    switch (parsed.type as PacketType) {
      case "hi": {
        const parsedData = parsed.data as PacketData["hi"];

        // process hi message and reconcile with state
        const room = this.findRoom(parsedData.room.id);
        if (room) {
          parsedData.room.users.forEach(user => {
            room.users.set(this.key(user), user);
          });
        }

        // relay hi to other peers
        if (this.config.relay === RelayMode.All) {
          room?.users.forEach(user => {
            if (user.userId !== peerId && user.userId !== this.nickname) {
              this.sendPacket(user, parsed);
            }
          });
        }
        break;
      }
      case "message": {
        const data = parsed.data as PacketData["message"];
        if (data.dst !== this.nickname && this.config.relay === RelayMode.All) {
          this.log(`relaying message to ${data.dst}`);
          this.sendMessageTo(
            { userId: data.dst, peerId: data.dst },
            data.room,
            data.payload,
            data.src,
            true // TODO - for the time being
          );
        } else {
          // assume it's for me
          this.callback(data.src, data.room, data.payload);
        }
        break;
      }
    }
  }

  private handleDisconnection(peerData: PeerData, reliable: boolean) {
    this.log("DISCONNECTED from " + peerData.id + " through " + connectionIdFor(this.nickname, peerData.id, peerData.sessionId, reliable));
    // TODO - maybe add a callback for the client to know that a peer has been disconnected, also might need to handle connection errors - moliva - 16/12/2019
    if (this.connectedPeers[peerData.id]) {
      delete this.connectedPeers[peerData.id];
    }
    // removing all users connected via this peer of each room
    this.currentRooms.forEach(room => {
      [...room.users.values()].forEach(user => {
        if (user.peerId === peerData.id) {
          room.users.delete(this.key(user));
        }
      });
    });
  }

  private handleConnection(peerData: PeerData, reliable: boolean) {
    this.log("CONNECTED to " + peerData.id + " through " + connectionIdFor(this.nickname, peerData.id, peerData.sessionId, reliable));

    this.peerConnectionPromises[peerData.id]?.forEach($ => $.resolve());
    delete this.peerConnectionPromises[peerData.id];

    // const room = this.findRoom(roomId);
    // TODO: Check rooms with user that connected
    // TODO - we may need to close the connection if we are no longer interested in the room - moliva - 13/12/2019
  }

  sendMessage(roomId: string, payload: any, reliable: boolean = true) {
    const room = this.currentRooms.find(room => room.id === roomId);
    if (!room) {
      return Promise.reject(new Error(`cannot send a message in a room not joined (${roomId})`));
    }

    [...room.users.values()].filter(user => user.userId !== this.nickname).forEach(user => this.sendMessageTo(user, roomId, payload, this.nickname, reliable));

    return Promise.resolve();
  }

  private sendMessageTo(user: PeerConnectionData, roomId: string, payload: any, src: string = this.nickname, reliable: boolean = true) {
    const data = {
      room: roomId,
      src,
      dst: user.userId,
      payload,
      hops: 0,
      ttl: 5
    };

    const packet: Packet<"message"> = {
      type: "message",
      data
    };

    this.sendPacket(user, packet);
  }

  private sendPacket<T extends PacketType>(user: PeerConnectionData, packet: Packet<T>) {
    const peer = this.config.relay === RelayMode.All && user.peerId === this.nickname ? this.connectedPeers[user.userId] : this.connectedPeers[user.peerId];
    if (peer) {
      // const connection = reliable
      //   ? "reliableConnection"
      //   : "unreliableConnection";
      const connection = "reliableConnection";
      const conn = peer[connection];
      if (conn.writable) {
        conn.write(JSON.stringify(packet));
      }
    } else {
      // TODO - review this case - moliva - 11/12/2019
      this.log(`peer ${user.peerId} required to talk to user ${user.userId} does not exist`);
    }
    //TODO: Fail on error? Promise rejection?
  }

  private handleSignal(peerData: PeerData, reliable: boolean) {
    const connectionId = connectionIdFor(this.nickname, peerData.id, peerData.sessionId, reliable);
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
        peer.reliableConnection.removeAllListeners();
        peer.reliableConnection.destroy();
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
      reliableConnection: new SimplePeer({
        initiator,
        config: this.connectionConfig,
        channelConfig: {
          label: connectionIdFor(this.nickname, peerId, sessionId, true)
        },
        wrtc: this.wrtc,
        objectMode: true
      })
      // unreliableConnection: new SimplePeer({
      //   initiator,
      //   config: this.connectionConfig,
      //   channelConfig: {
      //     label: connectionIdFor(this.nickname, peerId, false),
      //     ordered: false,
      //     maxPacketLifetime: 1000 //This value should be aligned with frame refreshes. Maybe configurable?
      //   },
      //   wrtc: this.wrtc,
      //   objectMode: true
      // })
    });

    this.subscribeToConnection(peer, peer.reliableConnection, true);
    // this.subscribeToConnection(peerId, peer.unreliableConnection, false);
    return peer;
  }

  // handles ws messages from this peer's PeerJSServerConnection
  handleMessage(message: ServerMessage): void {
    const { type, payload, src: peerId, dst } = message;

    if (dst === this.nickname) {
      this.log(`Received message from ${peerId}: ${type}`);
      switch (type) {
        case ServerMessageType.Offer:
          if (this.checkForCrossOffers(peerId)) {
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
        case ServerMessageType.PeerLeftRoom: {
          const { roomId, userId, peerId } = payload;
          this.findRoom(roomId)?.users.delete(this.key({ userId, peerId }));
          break;
        }
      }
    }
  }

  private checkForCrossOffers(peerId: string, sessionId?: string) {
    const isCrossOfferToBeDiscarded = this.hasInitiatedConnectionFor(peerId) && (!sessionId || this.connectedPeers[peerId].sessionId != sessionId) && this.nickname < peerId;
    if (isCrossOfferToBeDiscarded) {
      this.log("Received offer/candidate for already existing peer but it was discarded: " + peerId);
    }

    return isCrossOfferToBeDiscarded;
  }
}
