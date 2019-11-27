import PeerJS from "peerjs";

export class Peer implements IPeer {
  private peer: PeerJS;

  constructor(private lighthouseUrl: string, public nickname: string) {
    this.peer = new PeerJS(
      nickname
      //   {
      //   host: "localhost",
      //   port: 9000,
      //   path: "/"
      // }
    );
    this.peer.on("connection", conn => {
      conn.on("data", data => {
        console.log(data);
      });
    });
  }

  async joinRoom(roomId: string): Promise<void> {
    console.log(
      `joining room ${roomId} in ${this.lighthouseUrl} with name ${this.nickname}`
    );
    const room = await fetch(`${this.lighthouseUrl}/rooms/${roomId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id: this.nickname })
    }).then(res => res.json());
    console.log(room);

    room.forEach(user => {
      const conn = this.peer.connect(user.id);

      console.log(`opening connection to ${user.id}`);
      conn.on("open", () => {
        console.log(`connection open hi to ${user.id}`);
        conn.send(`hi, I'm ${this.nickname}!`);
      });
    });
  }
}

export interface IPeer {
  nickname: string
  joinRoom(room: string): Promise<void>
}
