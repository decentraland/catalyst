import { Peer, PacketCallback } from "../src/Peer";
import { PeerConnectionData } from "../src/types";
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
  // console.log(`Received message from ${sender} in ${room}`, payload);
};

function createPeer(
  peerId: string,
  socketDestination?: SocketMock,
  callback: PacketCallback = messageHandler
) {
  const socket = new SocketMock(socketDestination);
  return [
    socket,
    new Peer("http://notimportant:8888", peerId, callback, {
      socketBuilder: url => socket
    })
  ] as [SocketMock, Peer];
}

describe("Peer Integration Test", function() {
  let peerIds: Record<string, PeerConnectionData[]>;

  const expectSinglePeerInRoom = (peer: Peer, roomId: string) =>
    _expectSinglePeerInRoom(peerIds, peer, roomId);

  beforeEach(() => {
    peerIds = {};
    globalScope.fetch = (input, init) => {
      console.log(`init ${JSON.stringify(init)}`);
      if (init.method === "PUT") {
        const segments = (input as string).split("/");
        const roomId = segments[segments.length - 1];

        if (!peerIds[roomId]) {
          peerIds[roomId] = [];
        }
        peerIds[roomId].push(JSON.parse(init.body));

        return Promise.resolve(new Response(JSON.stringify(peerIds[roomId])));
      }

      return Promise.reject("not handled");
    };
  });

  afterEach(() => {
    globalScope.fetch = oldFetch;
  });

  it("Timeouts awaiting a non-existing connection", async () => {
    const [, peer1] = createPeer("peer1");
    try {
      await peer1.beConnectedTo("notAPeer", 200);
      fail("Should timeout");
    } catch (e) {
      expect(e).toBe(
        "Awaiting connection to peer notAPeer timed out after 200ms"
      );
    }
  });

  it("Performs handshake as expected", async () => {
    const [peer1, peer2] = await createConnectedPeers("peer1", "peer2", "room");

    assertConnectedTo(peer1, peer2);
    assertConnectedTo(peer2, peer1);
  });

  it("Sends and receives data", async () => {
    const [peer1, peer2] = await createConnectedPeers("peer1", "peer2", "room");

    const peer1MessagePromise = new Promise(resolve => {
      peer1.callback = (sender, room, payload) => {
        resolve({ sender, room, payload });
      };
    });

    await peer2.sendMessage("room", { hello: "world" });

    const received = await peer1MessagePromise;

    expect(received).toEqual({
      sender: "peer2",
      room: "room",
      payload: { hello: "world" }
    });
  });

  it("Joins a lone room", async () => {
    const [, peer] = createPeer("peer");

    await doJoinRoom(peer, "room");

    expectSinglePeerInRoom(peer, "room");
  });

  it("Does not see peers in other rooms", async () => {
    const [, peer1] = createPeer("peer1");

    await doJoinRoom(peer1, "room1");

    const [, peer2] = createPeer("peer2");

    await doJoinRoom(peer2, "room2");

    expectSinglePeerInRoom(peer1, "room1");
    expectSinglePeerInRoom(peer2, "room2");
  });
});

async function doJoinRoom(peer: Peer, room: string) {
  await peer.joinRoom(room);
}

async function createConnectedPeers(
  peerId1: string,
  peerId2: string,
  room: string
) {
  const [peer1Socket, peer1] = createPeer(peerId1);

  await doJoinRoom(peer1, room);

  const [, peer2] = createPeer(peerId2, peer1Socket);

  await doJoinRoom(peer2, room);

  await peer1.beConnectedTo(peerId2);

  return [peer1, peer2];
}

function assertConnectedTo(peer: Peer, otherPeer: Peer) {
  const peerRoom = peer.currentRooms[0];
  expect(peerRoom.id).toBe("room");
  expect(peerRoom.users.size).toBe(2);
  expect(
    peerRoom.users.has(`${otherPeer.nickname}:${otherPeer.nickname}`)
  ).toBeTrue();
  //@ts-ignore
  const peerToPeer = peer.peers[otherPeer.nickname];
  expect(peerToPeer.reliableConnection).toBeDefined();
  expect(peerToPeer.reliableConnection.writable).toBeTrue();
}

function _expectSinglePeerInRoom(
  peerIds: Record<string, PeerConnectionData[]>,
  peer: Peer,
  roomId: string
) {
  expect(peerIds[roomId]).toBeDefined();
  expect(peerIds[roomId].length).toBe(1);
  expect(peer.currentRooms.length).toBe(1);
  const peerRoom = peer.currentRooms[0];
  expect(peerRoom.id).toBe(roomId);
  expect(peerRoom.users.size).toBe(1);
  expect(peerRoom.users.has(`${peer.nickname}:${peer.nickname}`)).toBeTrue();
  //@ts-ignore
  expect(Object.entries(peer.peers).length).toBe(0);
}
