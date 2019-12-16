import { Peer, PacketCallback } from "../src/Peer";
import { PeerConnectionData } from "../src/types";
import { SocketType } from "../src/peerjs-server-connector/socket";
import { future } from "fp-future";

const oldFetch = fetch;
const globalScope: any = typeof window === "undefined" ? global : window;

class SocketMock implements SocketType {
  onmessage: any = () => {};
  onclose: any = () => {};

  set onopen(f: any) {
    f();
  }

  readyState: number = 1;

  constructor(private destinations: SocketMock[]) {
    for (const destination of destinations) {
      destination.destinations.push(this);
    }
  }

  close(code?: number, reason?: string): void {}

  send(
    data: string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView
  ): void {
    this.destinations.forEach($ => $.onmessage({ data }));
  }
}

const messageHandler: PacketCallback = (sender, room, payload) => {
  // console.log(`Received message from ${sender} in ${room}`, payload);
};

function createPeer(
  peerId: string,
  socketDestination: SocketMock[] = [],
  callback: PacketCallback = messageHandler
): [SocketMock, Peer] {
  const socket = new SocketMock(socketDestination);

  return [
    socket,
    new Peer("http://notimportant:8888", peerId, callback, {
      socketBuilder: () => socket
    })
  ];
}

describe("Peer Integration Test", function() {
  let peerIds: Record<string, PeerConnectionData[]>;

  function expectSinglePeerInRoom(peer: Peer, roomId: string) {
    expect(peerIds[roomId]).toBeDefined();
    expect(peerIds[roomId].length).toBe(1);

    const peerRoom = peer.currentRooms.find(room => room.id === roomId)!;
    expect(peerRoom).toBeDefined();

    expect(peerRoom.id).toBe(roomId);
    expect(peerRoom.users.size).toBe(1);
    expect(peerRoom.users.has(`${peer.nickname}:${peer.nickname}`)).toBeTrue();

    expectPeerToHaveNoConnections(peer);
  }

  function joinRoom(
    peerPair: { userId: string; peerId: string },
    roomId: string
  ) {
    if (!peerIds[roomId]) {
      peerIds[roomId] = [];
    }
    peerIds[roomId].push(peerPair);
  }

  let relayPeer;
  let relaySocket;
  let relay = false;

  function setUpRelay() {
    relay = true;
    [relaySocket, relayPeer] = createPeer("server");
  }

  beforeEach(() => {
    relay = false;
    relayPeer = undefined;
    relaySocket = undefined;
    peerIds = {};
    globalScope.fetch = (input, init) => {
      switch (init.method) {
        case "PUT": {
          const segments = (input as string).split("/");
          const roomId = segments[segments.length - 1];
          const peerPair = JSON.parse(init.body) as {
            userId: string;
            peerId: string;
          };
          joinRoom(
            relay ? { ...peerPair, peerId: "server" } : peerPair,
            roomId
          );
          return Promise.resolve(
            new Response(
              JSON.stringify(
                relay
                  ? peerIds[roomId].concat({
                      userId: "server",
                      peerId: "server"
                    })
                  : peerIds[roomId]
              )
            )
          );
        }
        case "DELETE": {
          const segments = (input as string).split("/");

          const roomId = segments[segments.length - 3];
          const userId = segments[segments.length - 1];

          const room = peerIds[roomId];
          if (!room) {
            return Promise.resolve(new Response(JSON.stringify([])));
          }

          const index = room.findIndex(u => u.userId === userId);
          if (index === -1) {
            return Promise.resolve(new Response(JSON.stringify(room)));
          }

          peerIds[roomId].splice(index, 1);

          return Promise.resolve(new Response(JSON.stringify(peerIds[roomId])));
        }
      }
      return Promise.reject(
        `mock fetch not able to handle ${JSON.stringify(
          input
        )} ${JSON.stringify(init)}`
      );
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

    expectConnectionInRoom(peer1, peer2, "room");
    expectConnectionInRoom(peer2, peer1, "room");
  });

  it("joining room twice should be idempotent", async () => {
    const [peer1, peer2] = await createConnectedPeers("peer1", "peer2", "room");

    expectConnectionInRoom(peer1, peer2, "room");
    expectConnectionInRoom(peer2, peer1, "room");

    await peer1.joinRoom("room");

    expectConnectionInRoom(peer1, peer2, "room");
    expectConnectionInRoom(peer2, peer1, "room");

    expectPeerToHaveNConnections(1, peer1);
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

    await peer.joinRoom("room");

    expectSinglePeerInRoom(peer, "room");
  });

  it("Does not see peers in other rooms", async () => {
    const [, peer1] = createPeer("peer1");

    await peer1.joinRoom("room1");

    const [, peer2] = createPeer("peer2");

    await peer2.joinRoom("room2");

    expectSinglePeerInRoom(peer1, "room1");
    expectSinglePeerInRoom(peer2, "room2");
  });

  it("does not receive message in other room", async () => {
    const [, peer3] = createPeer("peer3");

    await peer3.joinRoom("room3");

    const [peer1, peer2] = await createConnectedPeers("peer1", "peer2", "room");

    const message1 = future();
    peer1.callback = (sender, room, payload) => {
      message1.resolve({ sender, room, payload });
    };

    const message3 = future();
    peer3.callback = (sender, room, payload) => {
      message3.reject(new Error("peer3 should not receive messages"));
    };
    setTimeout(() => message3.resolve(undefined), 200);

    await peer2.sendMessage("room", { hello: "world" });

    const received = await message1;

    expect(received).toEqual({
      sender: "peer2",
      room: "room",
      payload: { hello: "world" }
    });
    expectSinglePeerInRoom(peer3, "room3");

    await message3;
  });

  it("leaves a room it is in", async () => {
    const [socket, mock] = createPeer("mock");
    await mock.joinRoom("room");

    const [, peer] = createPeer("peer", [socket]);

    await peer.joinRoom("room");

    expectPeerToBeInRoomWith(peer, "room", mock);

    await peer.leaveRoom("room");

    expect(peerIds["room"].length).toBe(1);
    expect(peer.currentRooms.length).toBe(0);

    expectPeerToHaveNoConnections(peer);
  });

  it("leaves a room idempotently", async () => {
    const [, peer] = createPeer("peer");

    await peer.joinRoom("room");

    expectSinglePeerInRoom(peer, "room");

    await peer.leaveRoom("room");

    expect(peerIds["room"].length).toBe(0);
    expect(peer.currentRooms.length).toBe(0);

    await peer.leaveRoom("room");

    expect(peerIds["room"].length).toBe(0);
    expect(peer.currentRooms.length).toBe(0);
  });

  it("leaves a room it is in without leaving the rest", async () => {
    const [, peer] = createPeer("peer");

    await peer.joinRoom("roomin");

    expectSinglePeerInRoom(peer, "roomin");

    await peer.leaveRoom("room");

    expect(peerIds["room"]).toBeUndefined();
    expectSinglePeerInRoom(peer, "roomin");
  });

  it("does not disconnect from other, when a room is still shared", async () => {
    const [socket1, mock1] = createPeer("mock1");
    await mock1.joinRoom("room");

    const [socket2, mock2] = createPeer("mock2", [socket1]);
    await mock2.joinRoom("room");
    await mock2.joinRoom("other");

    const [, peer] = createPeer("peer", [socket1, socket2]);
    await peer.joinRoom("room");
    await peer.joinRoom("other");

    expectPeerToBeInRoomWith(peer, "room", mock1, mock2);
    expectPeerToBeInRoomWith(peer, "other", mock2);
    expectPeerToHaveConnectionsWith(peer, mock1, mock2);

    await peer.leaveRoom("room");

    expect(peer.currentRooms.length).toBe(1);
    expectPeerToBeInRoomWith(peer, "other", mock2);
    expectPeerToHaveConnectionsWith(peer, mock2);
  });

  it("does not disconnect from peer, when relaying others (when relay in room)", async () => {
    setUpRelay();

    const [, mock1] = createPeer("mock1", [relaySocket]);
    await mock1.joinRoom("room");

    const [, mock2] = createPeer("mock2", [relaySocket]);
    await mock2.joinRoom("room");
    await mock2.joinRoom("other");

    const [, peer] = createPeer("peer", [relaySocket]);
    await peer.joinRoom("room");
    await peer.joinRoom("other");

    expectPeerToBeInRoomWith(peer, "room", mock1, mock2, relayPeer);
    expectPeerToBeInRoomWith(peer, "other", mock2, relayPeer);
    expectPeerToHaveConnectionsWith(peer, relayPeer);

    await peer.leaveRoom("room");

    expect(peer.currentRooms.length).toBe(1);
    expectPeerToBeInRoomWith(peer, "other", mock2, relayPeer);
    expectPeerToHaveConnectionsWith(peer, relayPeer);
  });

  function expectConnectionInRoom(peer: Peer, otherPeer: Peer, roomId: string) {
    expectPeerToBeInRoomWith(peer, roomId, otherPeer);
    expectPeerToBeConnectedTo(peer, otherPeer);
  }

  function expectPeerToBeConnectedTo(peer: Peer, otherPeer: Peer) {
    //@ts-ignore
    const peerToPeer = peer.peers[otherPeer.nickname];
    expect(peerToPeer.reliableConnection).toBeDefined();
    expect(peerToPeer.reliableConnection.writable).toBeTrue();
  }

  function expectPeerToBeInRoomWith(
    peer: Peer,
    roomId: string,
    ...otherPeers: Peer[]
  ) {
    const peerRoom = peer.currentRooms.find(room => room.id === roomId)!;
    expect(peerRoom).toBeDefined();
    expect(peerRoom.id).toBe(roomId);
    expect(peerRoom.users.size).toBe(otherPeers.length + 1);

    for (const otherPeer of otherPeers) {
      expect(
        peerRoom.users.has(
          `${otherPeer.nickname}:${
            relay ? relayPeer.nickname : otherPeer.nickname
          }`
        )
      ).toBeTrue();
    }
  }
});

function expectPeerToHaveNoConnections(peer: Peer) {
  expectPeerToHaveNConnections(0, peer);
}

function expectPeerToHaveNConnections(n: number, peer: Peer) {
  //@ts-ignore
  expect(Object.entries(peer.peers).length).toBe(n);
}

function expectPeerToHaveConnectionsWith(peer: Peer, ...others: Peer[]) {
  //@ts-ignore
  const peers = Object.values(peer.peers);

  expect(peers.length).toBe(others.length);

  for (const other of others) {
    expect(peers.some(($: any) => $.id === other.nickname)).toBeTrue();
  }
}

async function createConnectedPeers(
  peerId1: string,
  peerId2: string,
  room: string
) {
  const [peer1Socket, peer1] = createPeer(peerId1);

  await peer1.joinRoom(room);

  const [, peer2] = createPeer(peerId2, [peer1Socket]);

  await peer2.joinRoom(room);

  await peer1.beConnectedTo(peerId2);

  return [peer1, peer2];
}
