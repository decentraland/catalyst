import SimplePeer from "simple-peer";
// @ts-ignore
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
  // reliableConnection: IFuture<SimplePeer.DataConnection>;
  // unreliableConnection: IFuture<PeerJS.DataConnection>;
};

export class Peer implements IPeer {
  // private peer: SimplePeer.SimplePeer;
  private peers: Record<string, PeerData> = {};

  private peerServer: WebSocket;
  private connections: Record<string, SimplePeer.Instance> = {};

  public readonly currentRooms: Room[] = [];

  constructor(
    private lighthouseUrl: string,
    public nickname: string,
    private config: any = {},
    public callback: (
      sender: string,
      room: string,
      payload: any
    ) => void = () => {}
  ) {
    const url = new URL(lighthouseUrl);
    //@ts-ignore
    const { host, port, path } = {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 80
      // path: url.pathname
    };

    console.log("about to create ws");
    const ws = new WebSocket(
      `ws://${host}:${port}/peerjs?key=peerjs&id=${this.nickname}&token=asdf`
    );

    const self = this;
    ws.onopen = function(event) {
      console.log("ws open");
      self.peerServer = ws;
      setInterval(() => {
        console.log("ws sending hearbeat");
        ws.send(JSON.stringify({ type: "HEARBEAT" }));
      }, 1000);

      ws.onmessage = function(e) {
        const data = JSON.parse(e.data)
        console.log(`ws.onmessage ${JSON.stringify(data)}`);
        if (data.type === "ANSWER" || data.type === "CANDIDATE") {
          console.log(`signal on message! ${JSON.stringify(data)}`);
          self.connections[data.payload.connectionId].signal(data.payload.sdp);
        }
      };
    };
    // this.peer = new SimplePeer(nickname, {
    //   host: url.hostname,
    //   port: url.port ? parseInt(url.port) : 80,
    //   path: url.pathname,
    //   config
    // });

    // this.peer.on("connection", conn => {
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

  // private subscribeToConnection(conn: PeerJS.DataConnection) {
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
          reliableConnection: future()
          // unreliableConnection: future()
        };
        this.peers[user.id] = peer;
        this.initConnection(roomId, peer, true);
        // this.initConnection(roomId, peer, false);
      });
  }

  private initConnection(roomId: string, peer: PeerData, reliable: boolean) {
    // const conn = this.peer.connect(peer.id, {
    //   label: roomId,
    //   reliable
    // });

    // conn.on("open", () => {
    //   this.subscribeToConnection(conn);
    //   const connKey = reliable ? "reliableConnection" : "unreliableConnection";
    //   peer[connKey].resolve(conn);
    // });
    console.log(`init connection to ${roomId}`);
    const conn = new SimplePeer({
      initiator: true,
      trickle: true,
      config: this.config,
      channelName: "nestor"
    });

    conn.on("signal", data => {
      console.log(`signaling! ${JSON.stringify(data)}`);

      // if (data.type == "offer") {
      const offer = {
        type: "OFFER",
        src: this.nickname,
        dst: peer.id,
        payload: {
          sdp: data,
          type: "data",
          connectionId: `dc_${this.create_UUID()}`,
          browser: "chrome",
          label: roomId,
          reliable: reliable,
          serialization: "binary"
        }
      };
      this.connections[offer.payload.connectionId] = conn;
      // conn.signal(data)
      this.peerServer.send(JSON.stringify(offer));
      // }
    });

    conn.on("connect", () => {
      // wait for 'connect' event before using the data channel
      console.log(`connected to: ${peer.id}`);
      conn.send("hey peer2, how is it going?");

      conn.on("data", data => {
        console.log(`got data: ${JSON.stringify(data)}`);
        this.callback("osvaldo", "room", data);
      });

      const connKey = reliable ? "reliableConnection" : "unreliableConnection";
      peer[connKey].resolve(conn);
    });
  }

  create_UUID() {
    var dt = new Date().getTime();
    var uuid = "xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      var r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
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
