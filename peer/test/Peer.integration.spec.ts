import { Peer, PeerConnectionData } from "../src/Peer";
import { delay } from "../src/peerjs-server-connector/util";
import { SocketType } from "../src/peerjs-server-connector/socket";

const oldFetch = fetch;
const globalScope: any = typeof window === "undefined" ? global : window;

class SocketMock implements SocketType {
  onmessage: any = () => {};
  onclose: any = () => {};

  set onopen(f: any) {
    f();
  }

  readyState: number = 1;

  constructor(private destination?: SocketMock) {
    if (destination) {
      destination.destination = this;
    }
  }

  close(code?: number, reason?: string): void {}

  send(
    data: string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView
  ): void {
    this.destination?.onmessage({ data });
  }
}

const messageHandler: (sender: string, room: string, payload: any) => void = (
  sender,
  room,
  payload
) => {
  console.log(`Received message from ${sender} in ${room}`, payload);
};

describe("Peer Integration Test", function() {
  const peerIds: PeerConnectionData[] = [];

  beforeEach(() => {
    globalScope.fetch = (input, init) =>
      Promise.resolve(new Response(JSON.stringify(peerIds)));
  });

  afterEach(() => {
    globalScope.fetch = oldFetch;
  });

  it(`Performs handshake as expected`, async () => {
    const peer1Socket = new SocketMock();
    const peer2Socket = new SocketMock(peer1Socket);

    const peer1 = new Peer(
      "http://notimportant:8888/",
      "peer1",
      messageHandler,
      {
        socketBuilder: url => peer1Socket
      }
    );

    await peer1.joinRoom("room");

    peerIds.push({ userId: "peer1", peerId: "peer1" });

    const peer2 = new Peer(
      "http://notimportant:8888/",
      "peer2",
      messageHandler,
      {
        socketBuilder: url => peer2Socket
      }
    );

    await peer2.joinRoom("room");

    //TODO: This delay should be replaced with a kind of promise eventually
    await delay(600);

    const peer1Room = peer1.currentRooms[0];
    expect(peer1Room.id).toBe("room");
    expect(peer1Room.users.size).toBe(2);
    expect(peer1Room.users.has("peer2:peer2")).toBeTrue();
    //@ts-ignore
    const peer1ToPeer2 = peer1.peers["peer2"];
    expect(peer1ToPeer2.reliableConnection).toBeDefined();
    expect(peer1ToPeer2.reliableConnection.writable).toBeTrue();
  });
});
