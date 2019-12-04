import PeerJS from "peerjs";
import { future, IFuture } from "fp-future";

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
  reliableConnection: IFuture<PeerJS.DataConnection>;
  unreliableConnection: IFuture<PeerJS.DataConnection>;
};

export class Peer implements IPeer {
  private peer: PeerJS;
  private peers: Record<string, PeerData> = {};

  public readonly currentRooms: Room[] = [];

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
    this.peer = new PeerJS(nickname, {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 80,
      path: url.pathname,
      config
    });

    this.peer.on("connection", conn => {
      if (!this.peers[conn.peer]) {
        this.peers[conn.peer] = {
          id: conn.peer,
          reliableConnection: future(),
          unreliableConnection: future()
        };
      }
      const reliable = conn.reliable
        ? "reliableConnection"
        : "unreliableConnection";
      this.peers[conn.peer][reliable].resolve(conn);

      this.currentRooms
        .find(room => room.id === conn.label)
        ?.users.add(conn.peer);

      this.subscribeToConnection(conn);

      conn.on("close", () => {
        // remove peer from channels and peer list
        // const room = this.currentRooms[conn.label];
      });
    });
  }

  private subscribeToConnection(conn: PeerJS.DataConnection) {
    conn.on("data", data => {
      this.callback(conn.peer, data.room, data.payload);
    });
  }

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
          reliableConnection: future(),
          unreliableConnection: future()
        };
        this.peers[user.id] = peer;
        this.initConnection(roomId, peer, true);
        this.initConnection(roomId, peer, false);
      });
  }

  private initConnection(roomId: string, peer: PeerData, reliable: boolean) {
    const conn = this.peer.connect(peer.id, {
      label: roomId,
      reliable
    });

    conn.on("open", () => {
      this.subscribeToConnection(conn);
      const connKey = reliable ? "reliableConnection" : "unreliableConnection";
      peer[connKey].resolve(conn);
    });
  }

  sendMessage(roomId: string, payload: any, reliable: boolean = true) {
    const room = this.currentRooms.find(room => room.id === roomId);
    if (!room) {
      return Promise.reject(
        `cannot send a message in a room not joined (${roomId})`
      );
    }

    [...room.users]
      .filter(user => user !== this.nickname)
      .forEach(async user => {
        const peer = this.peers[user];
        if (peer) {
          const connection = reliable
            ? "reliableConnection"
            : "unreliableConnection";
          const conn = await peer[connection];
          conn.send({
            room: roomId,
            payload
          });
        }
      });

    return Promise.resolve();
  }
}
