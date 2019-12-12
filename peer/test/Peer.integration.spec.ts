import { Peer, PeerConnectionData, PacketCallback } from "../src/Peer";
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

const messageHandler: PacketCallback = (sender, room, payload) => {
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

  function createPeer(
    peerId: string,
    socketDestination?: SocketMock,
    callback: PacketCallback = messageHandler
  ) {
    const socket = new SocketMock(socketDestination);
    return [
      socket,
      new Peer("http://notimportant:8888/", peerId, callback, {
        socketBuilder: url => socket
      })
    ] as [SocketMock, Peer];
  }

  it("Timeouts awaiting a non-existing connection", async () => {
    const [, peer1] = createPeer("peer1");
    try {
      await peer1.beConnectedTo("notAPeer", 200);
      fail("Should timeout")
    } catch (e) {
      expect(e).toBe("Awaiting connection to peer notAPeer timed out after 200ms")
    }
  });

  it("Performs handshake as expected", async () => {
    const [peer1Socket, peer1] = createPeer("peer1");

    await peer1.joinRoom("room");

    peerIds.push({ userId: "peer1", peerId: "peer1" });

    const [, peer2] = createPeer("peer2", peer1Socket);

    await peer2.joinRoom("room");
    await peer1.beConnectedTo("peer2");

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
