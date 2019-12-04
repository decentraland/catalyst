import {
  PeerJSServerConnection,
  MessageHandler
} from "./peerjs-server-connector/peerjsserverconnection";
import { ServerMessage } from "./peerjs-server-connector/servermessage";
import { ServerMessageType } from "./peerjs-server-connector/enums";
import SimplePeer from "simple-peer";

export type User = string;
export type Room = { id: string; users: Set<User> };

export interface IPeer {
  nickname: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  joinRoom(room: string): Promise<void>;
  sendMessage(room: string, payload: any, reliable?: boolean): Promise<void>;
}

type PeerData = {
  id: string;
  connected?: boolean;
  reliableConnection: SimplePeer.Instance;
  unreliableConnection?: SimplePeer.Instance;
};

export class Peer implements IPeer {
  private peerJsConnection: PeerJSServerConnection;
  private peers: Record<string, PeerData> = {};

  public readonly currentRooms: Room[] = [];

  private handleSignal(peerId: string) {
    return data => {
      console.log("Signal from peer " + peerId, data);
      if (data.type === "answer") {
        this.peerJsConnection.sendAnswer(peerId, data);
      } else if (data.candidate) {
        this.peerJsConnection.sendCandidate(peerId, data);
      }
    };
  }

  private get messageHandler(): MessageHandler {
    const subscribeToConnection = (peerId, connection) => this.subscribeToConnection(peerId, connection);
    const peers = this.peers;

    function getPeer(peerId: string) {
      let peer = peers[peerId];
      if (!peer) {
        peer = peers[peerId] = {
          id: peerId,
          reliableConnection: new SimplePeer({})
        };
        subscribeToConnection(peerId, peer.reliableConnection)
      }
      return peer;
    }

    return {
      handleMessage(message: ServerMessage): void {
        const { type, payload, src: peerId } = message;
        switch (type) {
          case ServerMessageType.Offer:
          case ServerMessageType.Answer: {
            const peer = getPeer(peerId);
            peer.reliableConnection.signal(payload.sdp);
            break;
          }
          case ServerMessageType.Candidate: {
            const peer = getPeer(peerId);
            peer.reliableConnection.signal({ candidate: payload.candidate });
          }
        }
      }
    };
  }

  constructor(
    private lighthouseUrl: string,
    public nickname: string,
    config: any = {},
    public callback: (
      sender: string,
      room: string,
      payload: any
    ) => void = () => {}
  ) {
    const url = new URL(lighthouseUrl);
    this.peerJsConnection = new PeerJSServerConnection(
      this.messageHandler,
      nickname,
      {
        host: url.hostname,
        port: url.port ? parseInt(url.port) : 80,
        path: url.pathname,
        config
      }
    );

    // this.peerJsConnection.on("connection", conn => {
    //   if (!this.peers[conn.peer]) {
    //     this.peers[conn.peer] = {
    //       id: conn.peer,
    //       reliableConnection: future(),
    //       unreliableConnection: future()
    //     };
    //   }
    //   const reliable = conn.reliable
    //     ? "reliableConnection"
    //     : "unreliableConnection";
    //   this.peers[conn.peer][reliable].resolve(conn);

    //   this.currentRooms
    //     .find(room => room.id === conn.label)
    //     ?.users.add(conn.peer);

    //   this.subscribeToConnection(conn);

    //   conn.on("close", () => {
    //     // remove peer from channels and peer list
    //     // const room = this.currentRooms[conn.label];
    //   });
    // });
  }

  // private subscribeToConnection(conn: SimplePeer) {
  //   conn.on("data", data => {
  //     this.callback(conn.peer, data.room, data.payload);
  //   });
  // }

  async joinRoom(roomId: string): Promise<void> {
    const room: { id: string }[] = await fetch(
      `${this.lighthouseUrl}/rooms/${roomId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id: this.nickname })
      }
    ).then(res => res.json());

    this.currentRooms.push({
      id: roomId,
      users: new Set(room.map(user => user.id))
    });

    room
      .filter(user => user.id !== this.nickname)
      .forEach(user => {
        const peer = {
          id: user.id,
          reliableConnection: new SimplePeer({ initiator: true })
        };
        this.peers[user.id] = peer;
        peer.reliableConnection.on("signal", data => {
          if (data.type === "offer") {
            this.peerJsConnection.sendOffer(user.id, roomId, data);
          }
        });

        this.subscribeToConnection(user.id, peer.reliableConnection)
        // this.initConnection(roomId, peer, true);
        // this.initConnection(roomId, peer, false);
      });
  }

  private subscribeToConnection(peerId: string, connection: SimplePeer.Instance) {
    connection.on("signal", this.handleSignal(peerId))
    connection.on("connect", () => {
      console.log("CONNECTED to " + peerId);
      this.peers[peerId].connected = true;
      //TODO
      this.currentRooms.forEach(it => it.users.add(peerId))
    })

    connection.on("data", data => {
      if(data instanceof Uint8Array)
        data = new TextDecoder("utf-8").decode(data);
      console.log("DATA from " + peerId, data);
      const parsed = JSON.parse(data);
      this.callback(peerId, parsed.room, parsed.payload)
    })
  }

  // private initConnection(roomId: string, peer: PeerData, reliable: boolean) {
  //   const conn = this.peerConnection.connect(peer.id, {
  //     label: roomId,
  //     reliable
  //   });

  //   conn.on("open", () => {
  //     console.log(`opened connection`);
  //     this.subscribeToConnection(conn);
  //     const connKey = reliable ? "reliableConnection" : "unreliableConnection";
  //     peer[connKey].resolve(conn);
  //   });
  // }

  sendMessage(roomId: string, payload: any, reliable: boolean = true) {
    const room = this.currentRooms.find(room => room.id === roomId);
    if (!room) {
      return Promise.reject(
        `cannot send a message in a room not joined (${roomId})`
      );
    }

    [...room.users]
      .filter(user => user !== this.nickname)
      .forEach(user => {
        const peer = this.peers[user];
        if (peer && peer.connected) {
          const connection = reliable
            ? "reliableConnection"
            : "unreliableConnection";
          const conn = peer[connection];
          conn?.send(
            JSON.stringify({
              room: roomId,
              payload
            })
          );
        }
      });

    return Promise.resolve();
  }
}
