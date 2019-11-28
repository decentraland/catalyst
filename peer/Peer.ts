import PeerJS from "peerjs";

export type User = { id: string };
export type Room = { id: string; users: User[] };

export interface IPeer {
  nickname: string;
  currentRooms: Room[];
  callback: (sender: string, room: string, payload: any) => void;
  joinRoom(room: string): Promise<void>;
  sendMessage(room: string, payload: string): Promise<void>;
}

type PeerData = { id: string; connection: PeerJS.DataConnection };

export class Peer implements IPeer {
  private peer: PeerJS;
  private peers: PeerData[] = [];

  public readonly currentRooms: Room[] = [];

  constructor(
    private lighthouseUrl: string,
    public nickname: string,
    public callback: (
      sender: string,
      room: string,
      payload: any
    ) => void = () => {}
  ) {
    // TODO - change peer js server to use actual lighthouse url - moliva - 27/11/2019
    this.peer = new PeerJS(nickname, {
      host: "localhost",
      port: 9000,
      path: "/"
    });

    this.peer.on("connection", conn => {
      console.log(
        `connection received from ${conn.peer}, in channel ${conn.label}`
      );
      this.peers.push({ id: conn.peer, connection: conn });
      this.currentRooms
        .find(room => room.id === conn.label)
        ?.users.push({ id: conn.peer });

      this.subscribeToConnection(conn);

      conn.on("close", () => {
        // remove peer from channels and peer list
        // const room = this.currentRooms[conn.label];
      });
    });
  }

  private subscribeToConnection(conn: PeerJS.DataConnection) {
    conn.on("data", data => {
      console.log(data);
      this.callback(conn.peer, data.room, data.payload);
    });
  }

  async joinRoom(roomId: string): Promise<void> {
    const room = await fetch(`${this.lighthouseUrl}/rooms/${roomId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id: this.nickname })
    }).then(res => res.json());
    console.log(room);
    this.currentRooms.push({ id: roomId, users: room });

    room
      .filter(user => user.id !== this.nickname)
      .forEach(user => {
        const conn = this.peer.connect(user.id, { label: roomId });

        conn.on("open", () => {
          console.log(`connection open to ${user.id}`);
          this.peers.push({ id: user.id, connection: conn });
        });

        this.subscribeToConnection(conn);
      });
  }

  sendMessage(roomId: string, payload: string) {
    const room = this.currentRooms.find(room => room.id === roomId);
    if (!room) {
      return Promise.reject(
        `cannot send a message in a room not joined (${roomId})`
      );
    }
    console.log(`sending message ${payload} to room ${roomId}`);
    room.users.forEach(user => {
      console.log(`sending message to ${user.id}`);
      const peer = this.peers.find(peer => peer.id === user.id);
      if (peer) {
        peer.connection.send({ room: roomId, payload });
      }
    });
    return Promise.resolve();
  }
}
