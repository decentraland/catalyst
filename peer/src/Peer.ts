import { PeerJSServerConnection } from "./peerjs-server-connector/peerjsserverconnection";
import { ServerMessage } from "./peerjs-server-connector/servermessage";
import { ServerMessageType } from "./peerjs-server-connector/enums";
import SimplePeer, { SignalData } from "simple-peer";
import {
  isReliable,
  connectionIdFor,
  util
} from "./peerjs-server-connector/util";
import { SocketBuilder } from "./peerjs-server-connector/socket";
import { PeerConnectionData, IPeer, Room } from "./types";

interface PacketData {
  hi: { room: { id: string; users: PeerConnectionData[] } };
  message: { room: string; src: string; dst: string; payload: any };
}

type PacketType = keyof PacketData;
type Packet<T extends PacketType> = {
  type: T;
  data: PacketData[T];
};

type PeerData = {
  id: string;
  reliableConnection: SimplePeer.Instance;
  // unreliableConnection: SimplePeer.Instance;
};

const PeerSignals = { offer: "offer", answer: "answer" };

function signalMessage(
  peer: PeerData,
  connectionId: string,
  signal: SignalData
) {
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
  relay?: RelayMode;
};

export type PacketCallback = (
  sender: string,
  room: string,
  payload: any
) => void;

export class Peer implements IPeer {
  private peerJsConnection: PeerJSServerConnection;
  private peers: Record<string, PeerData> = {};

  private peerConnectionPromises: Record<
    string,
    { resolve: () => void; reject: () => void }[]
  > = {};

  public readonly currentRooms: Room[] = [];
  private connectionConfig: any;
  private wrtc: any;

  constructor(
    private lighthouseUrl: string,
    public nickname: string,
    public callback: PacketCallback = () => {},
    private config: PeerConfig = { relay: RelayMode.None }
  ) {
    const url = new URL(lighthouseUrl);
    
    this.config.token = this.config.token ?? util.randomToken();

    this.peerJsConnection = new PeerJSServerConnection(this, nickname, {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 80,
      path: url.pathname,
      token: this.config.token,
      ...(config.socketBuilder ? { socketBuilder: config.socketBuilder } : {})
    });

    this.wrtc = config.wrtc;

    this.connectionConfig = {
      ...(config.connectionConfig || {})
    };
  }

  async joinRoom(roomId: string): Promise<any> {
    const response = await fetch(`${this.lighthouseUrl}/rooms/${roomId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Peer-Token": this.config.token!,
      },
      body: JSON.stringify({ userId: this.nickname, peerId: this.nickname })
    });

    const roomUsers: PeerConnectionData[] = await response.json();

    const room = {
      id: roomId,
      users: new Map(roomUsers.map(data => [this.key(data), data]))
    };
    this.currentRooms.push(room);

    return Promise.all(
      roomUsers
        .filter(user => user.userId !== this.nickname)
        .map(user => {
          if (
            !this.hasConnectionsFor(user.peerId) &&
            user.peerId !== this.nickname
          ) {
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

  async leaveRoom(roomId: string) {
    const response = await fetch(
      `${this.lighthouseUrl}/rooms/${roomId}/users/${this.nickname}`,
      { method: "DELETE" }
    );

    const roomUsers: PeerConnectionData[] = await response.json();

    const index = this.currentRooms.findIndex(room => room.id === roomId);

    if (index === -1) {
      // not in room -> do nothing
      return Promise.resolve();
    }

    this.currentRooms.splice(index, 1);

    roomUsers.forEach(user => {
      const peer = this.peers[user.peerId];

      if (peer && !this.sharesRoomWith(peer.id)) {
        peer.reliableConnection.once("close", () => {
          delete this.peers[user.peerId];
        });
        peer.reliableConnection.destroy();
      }
    });
  }

  private sharesRoomWith(peerId: string) {
    return this.currentRooms.some(room =>
      [...room.users.values()].some(user => user.peerId === peerId)
    );
  }

  public beConnectedTo(peerId: string, timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const promisePair = { resolve, reject };
      if (this.isConnectedTo(peerId)) {
        resolve();
      } else {
        this.peerConnectionPromises[peerId] = [
          ...(this.peerConnectionPromises[peerId] || []),
          promisePair
        ];
      }

      setTimeout(() => {
        if (!this.isConnectedTo(peerId)) {
          reject(
            `Awaiting connection to peer ${peerId} timed out after ${timeout}ms`
          );
          this.peerConnectionPromises[peerId] = this.peerConnectionPromises[
            peerId
          ].splice(this.peerConnectionPromises[peerId].indexOf(promisePair), 1);
        }
      }, timeout);
    });
  }

  public disconnectFrom(peerId: string) {
    if (this.peers[peerId]) {
      console.log("[PEER] Disconnecting from " + peerId);
      this.peers[peerId].reliableConnection.destroy();
      delete this.peers[peerId];
    } else {
      console.log("[PEER] Already not connected to peer " + peerId);
    }
  }

  private key(data: PeerConnectionData) {
    return `${data.userId}:${data.peerId}`;
  }

  private hasConnectionsFor(peerId: string) {
    return !!this.peers[peerId];
  }

  private isConnectedTo(peerId: string): boolean {
    return (
      //@ts-ignore The `connected` property is not typed but it seems to be public
      this.peers[peerId] && this.peers[peerId].reliableConnection.connected
    );
  }

  private findRoom(id: string) {
    return this.currentRooms.find($ => $.id === id);
  }

  private subscribeToConnection(
    peerId: string,
    connection: SimplePeer.Instance,
    reliable: boolean,
    roomId: string
  ) {
    connection.on("signal", this.handleSignal(peerId, reliable, roomId));
    connection.on("close", () => this.handleDisconnection(peerId, reliable));
    connection.on("connect", () =>
      this.handleConnection(peerId, roomId, reliable)
    );

    connection.on("error", err => {
      console.log(
        "error in peer connection" +
          connectionIdFor(this.nickname, peerId, reliable),
        err
      );
    });

    connection.on("data", data => this.handlePeerPacket(data, peerId));
  }

  private handlePeerPacket(data: string, peerId: string) {
    const parsed = JSON.parse(data);
    switch (parsed.type as PacketType) {
      case "hi": {
        const data = parsed.data as PacketData["hi"];
        const room = this.findRoom(data.room.id);
        if (this.config.relay === RelayMode.All) {
          room?.users.forEach((user, userId) => {
            if (user.userId !== peerId && user.userId !== this.nickname) {
              this.sendPacket(user, parsed);
            }
          });
        } else {
          if (room) {
            data.room.users.forEach(user => {
              room.users.set(this.key(user), user);
            });
          }
        }
        break;
      }
      case "message": {
        const data = parsed.data as PacketData["message"];
        if (data.dst !== this.nickname && this.config.relay === RelayMode.All) {
          console.log(`relaying message to ${data.dst}`);
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

  private handleDisconnection(peerId: string, reliable: boolean) {
    console.log(
      "DISCONNECTED from " +
        peerId +
        " through " +
        connectionIdFor(this.nickname, peerId, reliable)
    );
    // TODO - maybe add a callback for the client to know that a peer has been disconnected, also might need to handle connection errors - moliva - 16/12/2019
    if (this.peers[peerId]) {
      delete this.peers[peerId];
    }
    // removing all users connected via this peer of each room
    this.currentRooms.forEach(room => {
      [...room.users.values()].forEach(user => {
        if (user.peerId === peerId) {
          room.users.delete(this.key(user));
        }
      });
    });
  }

  private handleConnection(peerId: string, roomId: string, reliable: boolean) {
    console.log(
      "CONNECTED to " +
        peerId +
        " through " +
        connectionIdFor(this.nickname, peerId, reliable)
    );

    this.peerConnectionPromises[peerId]?.forEach($ => $.resolve());
    delete this.peerConnectionPromises[peerId];

    const data = { userId: peerId, peerId };

    const room = this.findRoom(roomId);

    // if room is not found, we simply don't add the user
    // TODO - we may need to close the connection if we are no longer interested in the room - moliva - 13/12/2019
    room?.users.set(this.key(data), data);
  }

  sendMessage(roomId: string, payload: any, reliable: boolean = true) {
    const room = this.currentRooms.find(room => room.id === roomId);
    if (!room) {
      return Promise.reject(
        `cannot send a message in a room not joined (${roomId})`
      );
    }

    [...room.users.values()]
      .filter(user => user.userId !== this.nickname)
      .forEach(user =>
        this.sendMessageTo(user, roomId, payload, this.nickname, reliable)
      );

    return Promise.resolve();
  }

  private sendMessageTo(
    user: PeerConnectionData,
    roomId: string,
    payload: any,
    src: string = this.nickname,
    reliable: boolean = true
  ) {
    const data = {
      room: roomId,
      src,
      dst: user.userId,
      payload
    };
    const packet: Packet<"message"> = {
      type: "message",
      data
    };
    this.sendPacket(user, packet);
  }

  private sendPacket<T extends PacketType>(
    user: PeerConnectionData,
    packet: Packet<T>
  ) {
    const peer = this.peers[user.peerId];
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
      console.log(
        `peer ${user.peerId} required to talk to user ${user.userId} does not exist`
      );
    }
    //TODO: Fail on error? Promise rejection?
  }

  private handleSignal(peerId: string, reliable: boolean, roomId: string) {
    const connectionId = connectionIdFor(this.nickname, peerId, reliable);
    return (data: SignalData) => {
      console.log(`Signal in peer connection ${this.nickname}:${peerId}`);
      if (data.type === PeerSignals.offer) {
        this.peerJsConnection.sendOffer(peerId, data, connectionId, roomId);
      } else if (data.type === PeerSignals.answer) {
        this.peerJsConnection.sendAnswer(peerId, data, connectionId, roomId);
      } else if (data.candidate) {
        this.peerJsConnection.sendCandidate(peerId, data, connectionId, roomId);
      }
    };
  }

  private getOrCreatePeer(
    peerId: string,
    initiator: boolean = false,
    room: string
  ) {
    let peer = this.peers[peerId];
    if (!peer) {
      peer = this.peers[peerId] = {
        id: peerId,
        reliableConnection: new SimplePeer({
          initiator,
          config: this.connectionConfig,
          channelConfig: {
            label: connectionIdFor(this.nickname, peerId, true)
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
      };

      this.subscribeToConnection(peerId, peer.reliableConnection, true, room);
      // this.subscribeToConnection(peerId, peer.unreliableConnection, false);
    }
    return peer;
  }

  // handles ws messages from this peer's PeerJSServerConnection
  handleMessage(message: ServerMessage): void {
    const { type, payload, src: peerId, dst } = message;

    if (dst === this.nickname) {
      switch (type) {
        case ServerMessageType.Offer:
        case ServerMessageType.Answer: {
          const peer = this.getOrCreatePeer(peerId, false, payload.label);
          signalMessage(peer, payload.connectionId, payload.sdp);
          break;
        }
        case ServerMessageType.Candidate: {
          const peer = this.getOrCreatePeer(peerId, false, payload.label);
          signalMessage(peer, payload.connectionId, {
            candidate: payload.candidate
          });
        }
        case ServerMessageType.PeerLeftRoom: {
          const { roomId, userId, peerId } = payload;
          this.findRoom(roomId)?.users.delete(this.key({ userId, peerId }));
        }
      }
    }
  }
}
