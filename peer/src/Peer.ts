import { PeerJSServerConnection } from "./peerjs-server-connector/peerjsserverconnection";
import { ServerMessage } from "./peerjs-server-connector/servermessage";
import { ServerMessageType } from "./peerjs-server-connector/enums";
import SimplePeer, { SignalData } from "simple-peer";
import { isReliable, connectionIdFor } from "./peerjs-server-connector/util";
import { SocketBuilder } from "./peerjs-server-connector/socket";

export type PeerConnectionData = { userId: string; peerId: string };
export type Room = { id: string; users: Map<string, PeerConnectionData> };

export interface IPeer {
  nickname: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  joinRoom(room: string): Promise<void>;
  sendMessage(room: string, payload: any, reliable?: boolean): Promise<void>;
}

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
  relay?: RelayMode;
};

export class Peer implements IPeer {
  private peerJsConnection: PeerJSServerConnection;
  private peers: Record<string, PeerData> = {};

  public readonly currentRooms: Room[] = [];
  private connectionConfig: any;
  private wrtc: any;

  constructor(
    private lighthouseUrl: string,
    public nickname: string,
    public callback: (
      sender: string,
      room: string,
      payload: any
    ) => void = () => {},
    private config: PeerConfig = { relay: RelayMode.None }
  ) {
    const url = new URL(lighthouseUrl);
    this.peerJsConnection = new PeerJSServerConnection(this, nickname, {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 80,
      path: url.pathname,
      ...(config.socketBuilder ? { socketBuilder: config.socketBuilder } : {})
    });

    this.wrtc = config.wrtc;

    this.connectionConfig = {
      ...(config.connectionConfig || {})
    };
  }

  async joinRoom(roomId: string): Promise<void> {
    const roomUsers: PeerConnectionData[] = await fetch(
      `${this.lighthouseUrl}/rooms/${roomId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId: this.nickname, peerId: this.nickname })
      }
    ).then(res => res.json());

    const room = {
      id: roomId,
      users: new Map(roomUsers.map(data => [this.key(data), data]))
    };
    this.currentRooms.push(room);

    roomUsers
      .filter(user => user.userId !== this.nickname)
      .forEach(user => {
        if (
          !this.hasConnectionsFor(user.peerId) &&
          user.peerId !== this.nickname
        ) {
          this.getOrCreatePeer(user.peerId, true);
        }
        this.sendPacket(user, {
          type: "hi",
          data: { room: { id: room.id, users: [...room.users.values()] } }
        });
      });
  }

  private key(data: PeerConnectionData) {
    return `${data.userId}:${data.peerId}`;
  }

  private hasConnectionsFor(peerId: string) {
    return !!this.peers[peerId];
  }

  private subscribeToConnection(
    peerId: string,
    connection: SimplePeer.Instance,
    reliable: boolean
  ) {
    connection.on("signal", this.handleSignal(peerId, reliable));
    connection.on("connect", () => {
      console.log(
        "CONNECTED to " +
          peerId +
          " through " +
          connectionIdFor(this.nickname, peerId, reliable)
      );
      /*
       * TODO: Currently there is no way of knowing for an incomming
       * connection to which room the othe peer belongs, so we are adding them
       * to the all the rooms. There are multiple options:
       * - We refresh all the rooms when a user connects
       * - We make the peers exchange their rooms as their first messages
       * - We make the rooms a part of the handshake
       */
      const data = { userId: peerId, peerId };
      this.currentRooms.forEach(it => it.users.set(this.key(data), data));
    });

    connection.on("data", data => {
      const parsed = JSON.parse(data);
      switch (parsed.type as PacketType) {
        case "hi": {
          const data = parsed.data as PacketData["hi"];
          const room = this.currentRooms.find($ => $.id === data.room.id);
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
          if (
            data.dst !== this.nickname &&
            this.config.relay === RelayMode.All
          ) {
            console.log(`relaying message to ${parsed.dst}`);
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
    });
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
    }
  }

  private handleSignal(peerId: string, reliable: boolean) {
    const connectionId = connectionIdFor(this.nickname, peerId, reliable);
    return (data: SignalData) => {
      console.log("Signal from peer " + peerId, data);
      if (data.type === PeerSignals.offer) {
        this.peerJsConnection.sendOffer(peerId, data, connectionId);
      } else if (data.type === PeerSignals.answer) {
        this.peerJsConnection.sendAnswer(peerId, data, connectionId);
      } else if (data.candidate) {
        this.peerJsConnection.sendCandidate(peerId, data, connectionId);
      }
    };
  }

  private getOrCreatePeer(peerId: string, initiator: boolean = false) {
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

      this.subscribeToConnection(peerId, peer.reliableConnection, true);
      // this.subscribeToConnection(peerId, peer.unreliableConnection, false);
    }
    return peer;
  }

  handleMessage(message: ServerMessage): void {
    const { type, payload, src: peerId } = message;
    switch (type) {
      case ServerMessageType.Offer:
      case ServerMessageType.Answer: {
        const peer = this.getOrCreatePeer(peerId);
        signalMessage(peer, payload.connectionId, payload.sdp);
        break;
      }
      case ServerMessageType.Candidate: {
        const peer = this.getOrCreatePeer(peerId);
        signalMessage(peer, payload.connectionId, {
          candidate: payload.candidate
        });
      }
    }
  }
}
