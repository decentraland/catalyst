import { Peer } from "../src/Peer";
import { MinPeerData, PacketCallback } from "../src/types";
import { SocketType } from "../src/peerjs-server-connector/socket";
import { future } from "fp-future";
import { ServerMessageType } from "../src/peerjs-server-connector/enums";
import { PeerMessageTypes } from "../src/messageTypes";

declare var global: any;

const oldFetch = fetch;
const globalScope: any = typeof window === "undefined" ? global : window;

const layer = "blue";

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

  send(data: string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView): void {
    this.destinations.forEach(($) => $.onmessage({ data }));
  }
}

const messageHandler: PacketCallback = (sender, room, payload) => {
  // console.log(`Received message from ${sender} in ${room}`, payload);
};

describe("Peer Integration Test", function () {
  let roomPeers: Record<string, MinPeerData[]>;
  let layerPeers: Record<string, MinPeerData[]>;

  let sockets: Record<string, SocketMock>;

  async function createPeer(peerId: string, layerId: string = layer, socketDestination: SocketMock[] = [], callback: PacketCallback = messageHandler): Promise<[SocketMock, Peer]> {
    const socket = new SocketMock(socketDestination);

    const peer = new Peer("http://notimportant:8888", peerId, callback, {
      socketBuilder: () => socket,
    });

    sockets[peerId] = socket;

    await peer.setLayer(layerId);

    return [socket, peer];
  }

  async function createConnectedPeers(peerId1: string, peerId2: string, room: string) {
    const [peer1Socket, peer1] = await createPeer(peerId1);

    await peer1.joinRoom(room);

    const [, peer2] = await createPeer(peerId2, layer, [peer1Socket]);

    await peer2.joinRoom(room);

    await peer1.beConnectedTo(peerId2);

    return [peer1, peer2];
  }

  function setPeerConnectionEstablished(peer: Peer) {
    // @ts-ignore
    peer.peerJsConnection._open = true;
    // @ts-ignore
    peer.peerJsConnection._valid = true;
    // @ts-ignore
    peer.peerJsConnection._disconnected = false;
  }

  function setPeerConnectionRejected(peer: Peer) {
    // @ts-ignore
    peer.peerJsConnection._open = false;
    // @ts-ignore
    peer.peerJsConnection._valid = false;
    // @ts-ignore
    peer.peerJsConnection._disconnected = true;
  }

  function expectSinglePeerInRoom(peer: Peer, roomId: string) {
    expect(roomPeers[roomId]).toBeDefined();
    expect(roomPeers[roomId].length).toBe(1);

    const peerRoom = peer.currentRooms.find((room) => room.id === roomId)!;
    expect(peerRoom).toBeDefined();

    expect(peerRoom.id).toBe(roomId);
    expect(peerRoom.users.length).toBe(1);
    expect(peerRoom.users.includes(peer.peerIdOrFail())).toBeTrue();
  }

  function notify(peers: MinPeerData[], notificationKey: string, notification: ServerMessageType, peerData: MinPeerData, collectionId: string) {
    console.log("Notifying peers", notification, peers, peerData, collectionId);
    peers.forEach((it) =>
      sockets[it.id]?.onmessage({
        data: JSON.stringify({
          type: notification,
          src: "__lighthouse_notification__",
          dst: it.id,
          payload: { ...peerData, [notificationKey]: collectionId },
        }),
      })
    );
  }

  function joinCollection(collectionGetter: () => Record<string, MinPeerData[]>, notificationKey: string, notification: ServerMessageType) {
    return (peerPair: MinPeerData, collectionId: string) => {
      if (!collectionGetter()[collectionId]) {
        collectionGetter()[collectionId] = [];
      }

      if (collectionGetter()[collectionId].some(($) => $.id === peerPair.id)) return Promise.resolve(new Response(JSON.stringify(collectionGetter()[collectionId])));

      const toNotify = collectionGetter()[collectionId].slice();

      collectionGetter()[collectionId].push(peerPair);

      notify(toNotify, notificationKey, notification, peerPair, collectionId);

      return Promise.resolve(new Response(JSON.stringify(collectionGetter()[collectionId])));
    };
  }

  function leaveCollection(collectionsGetter: () => Record<string, MinPeerData[]>, notificationKey: string, notification: ServerMessageType) {
    return (peerId: string, collectionId: string) => {
      const collection = collectionsGetter()[collectionId];
      if (!collection) {
        return Promise.resolve(new Response(JSON.stringify([])));
      }

      const index = collection.findIndex((u) => u.id === peerId);
      if (index === -1) {
        return Promise.resolve(new Response(JSON.stringify(collection)));
      }

      const [peer] = collection.splice(index, 1);

      notify(collection, notificationKey, notification, peer, collectionId);

      return Promise.resolve(new Response(JSON.stringify(collection)));
    };
  }

  const joinRoom = joinCollection(() => roomPeers, "roomId", ServerMessageType.PeerJoinedRoom);
  const joinLayer = joinCollection(() => layerPeers, "layerId", ServerMessageType.PeerJoinedLayer);

  const leaveRoom = leaveCollection(() => roomPeers, "roomId", ServerMessageType.PeerLeftRoom);
  const leaveLayer = leaveCollection(() => layerPeers, "layerId", ServerMessageType.PeerLeftLayer);

  beforeEach(() => {
    roomPeers = {};
    layerPeers = {};
    sockets = {};
    globalScope.fetch = (input, init) => {
      const url = new URL(input);
      switch (init.method) {
        case "PUT": {
          const segments = url.pathname.split("/");
          console.log(segments.length);
          if (segments.length === 5) {
            const roomId = segments[segments.length - 1];
            const peerPair = JSON.parse(init.body) as MinPeerData;
            return joinRoom(peerPair, roomId);
          } else {
            const layerId = segments[segments.length - 1];
            return joinLayer(JSON.parse(init.body), layerId);
          }
        }
        case "DELETE": {
          const segments = url.pathname.split("/");
          if (segments.length === 7) {
            const roomId = segments[segments.length - 3];
            const userId = segments[segments.length - 1];
            return leaveRoom(userId, roomId);
          } else {
            const layerId = segments[segments.length - 3];
            const userId = segments[segments.length - 1];
            return leaveLayer(userId, layerId);
          }
        }
      }
      return Promise.reject(`mock fetch not able to handle ${JSON.stringify(input)} ${JSON.stringify(init)}`);
    };
  });

  afterEach(() => {
    globalScope.fetch = oldFetch;
  });

  it("Timeouts awaiting a non-existing connection", async () => {
    const [, peer1] = await createPeer("peer1");
    try {
      await peer1.beConnectedTo("notAPeer", 200);
      fail("Should timeout");
    } catch (e) {
      expect(e.message).toBe("[peer1] Awaiting connection to peer notAPeer timed out after 200ms");
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

    const peer1MessagePromise = new Promise((resolve) => {
      peer1.callback = (sender, room, payload) => {
        resolve({ sender, room, payload });
      };
    });

    await peer2.sendMessage("room", { hello: "world" }, PeerMessageTypes.reliable("reliable"));

    const received = await peer1MessagePromise;

    expect(received).toEqual({
      sender: "peer2",
      room: "room",
      payload: { hello: "world" },
    });
  });

  it("Joins a lone room", async () => {
    const [, peer] = await createPeer("peer");

    await peer.joinRoom("room");

    expectSinglePeerInRoom(peer, "room");
    expectPeerToHaveNoConnections(peer);
  });

  it("Awaits connection when connection is already established", async () => {
    const [, peer] = await createPeer("peer");

    setPeerConnectionEstablished(peer);

    await peer.awaitConnectionEstablished();
  });

  it("Awaits connection when connection is already disconnected", async () => {
    const [, peer] = await createPeer("peer");

    setPeerConnectionRejected(peer);

    return peer
      .awaitConnectionEstablished()
      .then(() => new Error("Promise should not be resolved"))
      .catch((e) => {});
  });

  it("Does not see peers in other rooms", async () => {
    const [, peer1] = await createPeer("peer1");

    await peer1.joinRoom("room1");

    const [, peer2] = await createPeer("peer2");

    await peer2.joinRoom("room2");

    expectSinglePeerInRoom(peer1, "room1");
    expectSinglePeerInRoom(peer2, "room2");
  });

  it("does not receive message in other room", async () => {
    const [, peer3] = await createPeer("peer3");

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

    await peer2.sendMessage("room", { hello: "world" }, PeerMessageTypes.reliable("reliable"));

    const received = await message1;

    expect(received).toEqual({
      sender: "peer2",
      room: "room",
      payload: { hello: "world" },
    });
    expectSinglePeerInRoom(peer3, "room3");

    await message3;
  });

  it("leaves a room it is in", async () => {
    const [socket, mock] = await createPeer("mock");
    await mock.joinRoom("room");

    const [, peer] = await createPeer("peer", layer, [socket]);

    await peer.joinRoom("room");

    expectPeerToBeInRoomWith(peer, "room", mock);

    await peer.leaveRoom("room");

    expect(roomPeers["room"].length).toBe(1);
    expect(peer.currentRooms.length).toBe(0);
  });

  it("leaves a room idempotently", async () => {
    const [, peer] = await createPeer("peer");

    await peer.joinRoom("room");

    expectSinglePeerInRoom(peer, "room");

    await peer.leaveRoom("room");

    expect(roomPeers["room"].length).toBe(0);
    expect(peer.currentRooms.length).toBe(0);

    await peer.leaveRoom("room");

    expect(roomPeers["room"].length).toBe(0);
    expect(peer.currentRooms.length).toBe(0);
  });

  it("leaves a room it is in without leaving the rest", async () => {
    const [, peer] = await createPeer("peer");

    await peer.joinRoom("roomin");

    expectSinglePeerInRoom(peer, "roomin");

    await peer.leaveRoom("room");

    expect(roomPeers["room"]).toBeUndefined();
    expectSinglePeerInRoom(peer, "roomin");
  });

  it("does not disconnect from other, when a room is still shared", async () => {
    const [socket1, mock1] = await createPeer("mock1");
    await mock1.joinRoom("room");

    const [socket2, mock2] = await createPeer("mock2", layer, [socket1]);
    await mock2.joinRoom("room");
    await mock2.joinRoom("other");

    const [, peer] = await createPeer("peer", layer, [socket1, socket2]);
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

  it("sets its id once logged into the server", async () => {
    const socket = new SocketMock([]);

    const peer = new Peer("http://notimportant:8888", undefined, messageHandler, {
      socketBuilder: () => socket,
    });

    socket.onmessage({data: JSON.stringify({ type: ServerMessageType.AssignedId, payload: { id: "assigned" } })});

    expect(peer.peerIdOrFail()).toBe("assigned");
  });

  it("sorts connection candidates by distance", () => {
    
  })

  it("creates a new connection when setting lighthouse url", () => {

  })

  it("retries connection when disconnected", () => {

  })

  it("expires messages periodically", () => {

  })

  it("expires peers periodically", () => {

  })

  it("requests network optimization on heartbeat periodically", () => {

  })

  it("adds known peers when joining layers", () => {

  })

  it("adds room when joining room", () => {

  })

  it("connects to close peers when updating network", () => {

  })

  it("disconnects when over connected when updating network", () => {

  })

  it("disconnects from distant peers when updating network", () => {

  })

  it("removes local room representation when leaving room", () => {

  })

  it("set peers position when updating known peers if their positions are old", () => {

  })

  it("performs only one network update at a time", () => {

  })

  it("perform various network updates in succession", () => {
    
  })

  it("selects valid connection candidates for network updates", () => {
    
  })

  it("finds the worst connected peer by distance", () => {

  })

  it("counts packet with statstics when received", () => {
    
  })

  it("marks a packet as received", () => {

  })

  it("marks a peer as reachable through when receiving a relayed packet", () => {

  })

  it("updates peer and room based on the packet", () => {
    
  })
  
  it("doesn't process a package expired or duplicate and requests relay suspension", () => {
    
  })

  it("processes a message packet", () => {
    
  })

  it("processes a relay suspension packet", () => {
    
  })

  it("consolidates relay suspension request adding pending suspension", () => {
    
  })

  it("ignores relay suspension request if only one link remains", () => {
    
  })

  it("sends pending succession requests at its interval", () => {
    
  })

  it("sends the corresponding packet for a message", () => {
    
  })

  it("sends the corresponding packet to valid peers", () => {
    
  })

  it("rejects a connection from a peer of another lighthouse or layer", () => {
    
  })

  it("rejects a connection from a peer with another protocol version", () => {
    
  })

  it("rejects a connection from a peer when it has too many connections", () => {
    
  })

  it("updates known peers and rooms with notifications from lighthouse", () => {
    
  })

  function expectConnectionInRoom(peer: Peer, otherPeer: Peer, roomId: string) {
    expectPeerToBeInRoomWith(peer, roomId, otherPeer);
    expectPeerToBeConnectedTo(peer, otherPeer);
  }

  function expectPeerToBeConnectedTo(peer: Peer, otherPeer: Peer) {
    //@ts-ignore
    const peerToPeer = peer.connectedPeers[otherPeer.peerId];
    expect(peerToPeer.connection).toBeDefined();
    expect(peerToPeer.connection.writable).toBeTrue();
  }

  function expectPeerToBeInRoomWith(peer: Peer, roomId: string, ...otherPeers: Peer[]) {
    const peerRoom = peer.currentRooms.find((room) => room.id === roomId)!;
    expect(peerRoom).toBeDefined();
    expect(peerRoom.id).toBe(roomId);
    expect(peerRoom.users.length).toBe(otherPeers.length + 1);

    for (const otherPeer of otherPeers) {
      expect(peerRoom.users.includes(otherPeer.peerIdOrFail())).toBeTrue();
    }
  }
});

function expectPeerToHaveNoConnections(peer: Peer) {
  expectPeerToHaveNConnections(0, peer);
}

function expectPeerToHaveNConnections(n: number, peer: Peer) {
  //@ts-ignore
  expect(Object.entries(peer.connectedPeers).length).toBe(n);
}

function expectPeerToHaveConnectionsWith(peer: Peer, ...others: Peer[]) {
  //@ts-ignore
  const peers = Object.values(peer.connectedPeers);

  expect(peers.length).toBeGreaterThanOrEqual(others.length);

  for (const other of others) {
    expect(peers.some(($: any) => $.id === other.peerId)).toBeTrue();
  }
}
