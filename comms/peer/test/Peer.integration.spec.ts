import { Peer } from "../src/Peer";
import { MinPeerData, PacketCallback, PeerConfig } from "../src/types";
import { SocketType } from "../src/peerjs-server-connector/socket";
import { future } from "fp-future";
import { ServerMessageType } from "../src/peerjs-server-connector/enums";
import { PeerMessageTypes, PeerMessageType } from "../src/messageTypes";
import { Packet } from "../src/proto/peer_protobuf";

declare var global: any;

const oldFetch = fetch;
const globalScope: any = typeof window === "undefined" ? global : window;

const layer = "blue";

class SocketMock implements SocketType {
  closed: boolean = false;
  onmessage: any = () => {};
  onclose: any = () => {};

  set onopen(f: any) {
    f();
  }

  readyState: number = 1;

  constructor(public destinations: SocketMock[]) {
    for (const destination of destinations) {
      destination.destinations.push(this);
    }
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
  }

  send(data: string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView): void {
    this.destinations.forEach(($) => $.onmessage({ data }));
  }
}

const messageHandler: PacketCallback = (sender, room, payload) => {
  // console.log(`Received message from ${sender} in ${room}`, payload);
};

type LighthouseState = {
  roomPeers: Record<string, MinPeerData[]>;
  layerPeers: Record<string, MinPeerData[]>;
};

describe("Peer Integration Test", function () {
  const DEFAULT_LIGHTHOUSE = "http://notimportant:8888";

  let lighthouses: Record<string, LighthouseState>;

  let sockets: Record<string, SocketMock>;

  let extraPeersConfig: Partial<PeerConfig>;

  function getLighthouse(lighthouse: string = DEFAULT_LIGHTHOUSE) {
    let aLighthouse = lighthouses[lighthouse];
    if (!aLighthouse) {
      aLighthouse = lighthouses[lighthouse] = { roomPeers: {}, layerPeers: {} };
    }

    return aLighthouse;
  }

  async function createPeer(peerId: string, layerId: string = layer, socketDestination: SocketMock[] = [], callback: PacketCallback = messageHandler): Promise<[SocketMock, Peer]> {
    const socket = new SocketMock(socketDestination);

    const peer = new Peer(DEFAULT_LIGHTHOUSE, peerId, callback, {
      socketBuilder: () => socket,
      ...extraPeersConfig,
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

  async function createConnectedPeersByQty(room: string, qty: number, layerId: string = layer) {
    const sockets: SocketMock[] = [];
    const peers: Peer[] = [];
    for (let i = 1; i <= qty; i++) {
      const socket = new SocketMock([]);
      sockets.push(socket);
      const peer = new Peer(DEFAULT_LIGHTHOUSE, "peer" + i, messageHandler, {
        socketBuilder: () => socket,
        ...extraPeersConfig,
      });

      peers.push(peer);
    }

    sockets.forEach((socket) => (socket.destinations = sockets.filter((dst) => dst !== socket)));

    await Promise.all(
      peers.map(async (it) => {
        await it.setLayer("layer");
        await it.joinRoom("room");
      })
    );

    console.log("Waiting for peers to be connected...");
    await whileTrue(() => peers.some((it) => it.connectedCount() === 0));

    return peers;
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

  function expectPeerInLayer(peer: Peer, layer: string, lighthouse: string = DEFAULT_LIGHTHOUSE) {
    // @ts-ignore
    expect(peer.currentLayer).toEqual("blue");

    expect(getLighthouse(lighthouse).layerPeers[layer]).toBeDefined();
    expect(getLighthouse(lighthouse).layerPeers[layer].map((it) => it.id)).toContain(peer.peerIdOrFail());
  }

  function expectSinglePeerInRoom(peer: Peer, roomId: string, lighthouse: string = DEFAULT_LIGHTHOUSE) {
    expect(getLighthouse(lighthouse).roomPeers[roomId].length).toBe(1);
    const peerRoom = expectPeerInRoom(peer, roomId, lighthouse);
    expect(peerRoom.users.length).toBe(1);
  }

  function expectPeerInRoom(peer: Peer, roomId: string, lighthouse: string = DEFAULT_LIGHTHOUSE) {
    expect(getLighthouse(lighthouse).roomPeers[roomId]).toBeDefined();
    expect(getLighthouse(lighthouse).roomPeers[roomId].map((it) => it.id)).toContain(peer.peerIdOrFail());
    const peerRoom = peer.currentRooms.find((room) => room.id === roomId)!;
    expect(peerRoom).toBeDefined();
    expect(peerRoom.id).toBe(roomId);
    expect(peerRoom.users.includes(peer.peerIdOrFail())).toBeTrue();
    return peerRoom;
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

  const joinRoom = (lighthouse: string) => joinCollection(() => getLighthouse(lighthouse).roomPeers, "roomId", ServerMessageType.PeerJoinedRoom);
  const joinLayer = (lighthouse: string) => joinCollection(() => getLighthouse(lighthouse).layerPeers, "layerId", ServerMessageType.PeerJoinedLayer);

  const leaveRoom = (lighthouse: string) => leaveCollection(() => getLighthouse(lighthouse).roomPeers, "roomId", ServerMessageType.PeerLeftRoom);
  const leaveLayer = (lighthouse: string) => leaveCollection(() => getLighthouse(lighthouse).layerPeers, "layerId", ServerMessageType.PeerLeftLayer);

  beforeEach(() => {
    lighthouses = {};
    sockets = {};
    extraPeersConfig = {};
    globalScope.fetch = (input, init) => {
      const url = new URL(input);
      switch (init.method) {
        case "PUT": {
          const segments = url.pathname.split("/");
          console.log(segments.length);
          if (segments.length === 5) {
            const roomId = segments[segments.length - 1];
            const peerPair = JSON.parse(init.body) as MinPeerData;
            return joinRoom(url.origin)(peerPair, roomId);
          } else {
            const layerId = segments[segments.length - 1];
            return joinLayer(url.origin)(JSON.parse(init.body), layerId);
          }
        }
        case "DELETE": {
          const segments = url.pathname.split("/");
          if (segments.length === 7) {
            const roomId = segments[segments.length - 3];
            const userId = segments[segments.length - 1];
            return leaveRoom(url.origin)(userId, roomId);
          } else {
            const layerId = segments[segments.length - 3];
            const userId = segments[segments.length - 1];
            return leaveLayer(url.origin)(userId, layerId);
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

    const received = await sendMessage(peer2, peer1, "room", { hello: "world" });

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

    expect(lighthouses[DEFAULT_LIGHTHOUSE].roomPeers["room"].length).toBe(1);
    expect(peer.currentRooms.length).toBe(0);
  });

  it("leaves a room idempotently", async () => {
    const [, peer] = await createPeer("peer");

    await peer.joinRoom("room");

    expectSinglePeerInRoom(peer, "room");

    await peer.leaveRoom("room");

    expect(lighthouses[DEFAULT_LIGHTHOUSE].roomPeers["room"].length).toBe(0);
    expect(peer.currentRooms.length).toBe(0);

    await peer.leaveRoom("room");

    expect(lighthouses[DEFAULT_LIGHTHOUSE].roomPeers["room"].length).toBe(0);
    expect(peer.currentRooms.length).toBe(0);
  });

  it("leaves a room it is in without leaving the rest", async () => {
    const [, peer] = await createPeer("peer");

    await peer.joinRoom("roomin");

    expectSinglePeerInRoom(peer, "roomin");

    await peer.leaveRoom("room");

    expect(lighthouses[DEFAULT_LIGHTHOUSE]?.roomPeers["room"]).toBeUndefined();
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

    const peer = new Peer(DEFAULT_LIGHTHOUSE, undefined, messageHandler, {
      socketBuilder: () => socket,
    });

    assignId(socket);

    expect(peer.peerIdOrFail()).toBe("assigned");
  });

  it("sorts connection candidates by distance", () => {
    const socket = new SocketMock([]);

    const peer = new Peer(DEFAULT_LIGHTHOUSE, undefined, messageHandler, {
      socketBuilder: () => socket,
      positionConfig: {
        selfPosition: () => [0, 0, 0],
        maxConnectionDistance: 4,
        nearbyPeersDistance: 5,
        disconnectDistance: 5,
      },
    });

    const knownPeers = [{ id: "4" }, { id: "3", position: [200, 0, 0] }, { id: "1", position: [40, 0, 0] }, { id: "2", position: [70, 0, 0] }];

    // @ts-ignore
    peer.updateKnownPeers(knownPeers);

    // @ts-ignore
    const sortedPeers = knownPeers.sort(peer.peerSortCriteria());

    expect(sortedPeers.map((it) => it.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("creates a new connection when setting lighthouse url", async () => {
    let i = -1;
    const sockets = [new SocketMock([]), new SocketMock([])];

    const otherLighthouse = "http://notimportant2:8888";

    const peer = new Peer(DEFAULT_LIGHTHOUSE, "peer", messageHandler, {
      socketBuilder: () => {
        i++;
        return sockets[i];
      },
    });

    assignId(sockets[0], "bar");

    await peer.setLayer("blue");
    await peer.joinRoom("room");

    peer.setLighthouseUrl(otherLighthouse);

    assignId(sockets[1]);

    expect(sockets[0].closed).toBe(true);
    expect(sockets[1].closed).toBe(false);

    // We don't rejoin rooms and layers by default when setting lighthouse url
    expect(getLighthouse(otherLighthouse).layerPeers["blue"]).toBeUndefined();
    expect(getLighthouse(otherLighthouse).roomPeers["room"]).toBeUndefined();

    expect(peer.peerIdOrFail()).toEqual("assigned");
  });

  it("retries connection when disconnected", async () => {
    let sockets: SocketMock[] = [];

    const peer = new Peer(DEFAULT_LIGHTHOUSE, undefined, messageHandler, {
      socketBuilder: () => {
        sockets.push(new SocketMock([]));
        return sockets[sockets.length - 1];
      },
      backoffMs: 10,
    });

    assignId(sockets[0], "bar");
    await peer.setLayer("blue");
    await peer.joinRoom("room");

    // We clear lighthouse state to see if it is reconstructed after reconnection
    lighthouses = {};

    sockets[0].onclose();

    await whileTrue(() => sockets.length === 1);

    assignId(sockets[1], "foo");
    openConnection(sockets[1]);

    await whileTrue(() => !getLighthouse().layerPeers["blue"]?.length);

    expectPeerInRoom(peer, "room");
    expectPeerInLayer(peer, "blue");

    expect(sockets.length).toEqual(2);
    expect(peer.peerIdOrFail()).toEqual("foo");
  });

  it("expires peers periodically", () => {});

  it("requests network optimization on heartbeat periodically", () => {});

  it("adds known peers when joining layers", () => {});

  it("adds room when joining room", () => {});

  it("connects to close peers when updating network", () => {});

  it("disconnects when over connected when updating network", () => {});

  it("disconnects from distant peers when updating network", () => {});

  it("removes local room representation when leaving room", () => {});

  it("set peers position when updating known peers if their positions are old", () => {});

  it("performs only one network update at a time", () => {});

  it("perform various network updates in succession", () => {});

  it("selects valid connection candidates for network updates", () => {});

  it("finds the worst connected peer by distance", () => {});

  it("counts packet with statstics when received", () => {});

  it("marks a packet as received", () => {});

  it("marks a peer as reachable through when receiving a relayed packet", () => {});

  it("updates peer and room based on the packet", () => {});

  it("doesn't process a package expired or duplicate and requests relay suspension", async () => {
    const [peer1, peer2] = await createConnectedPeers("peer1", "peer2", "room");

    const receivedMessages: { sender: string; room: string; payload: any }[] = [];

    peer2.callback = (sender, room, payload) => {
      receivedMessages.push({ sender, room, payload });
    };

    const message = "hello";

    const packet = createPacketForMessage(peer1, message, "room");

    // We send the same packet twice
    sendPacketThroughPeer(peer1, packet);
    sendPacketThroughPeer(peer1, packet);

    await whileTrue(() => receivedMessages.length === 0);

    // Only one packet should be processed
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].payload).toEqual(message);
    expect(peer2.stats.tagged.duplicate.totalPackets).toEqual(1);

    // We create a packet but send it later, effectively expiring it
    const expiredPacket = createPacketForMessage(peer1, "expired", "room", PeerMessageTypes.unreliable("unreliable"));

    const okPacket = createPacketForMessage(peer1, "ok", "room", PeerMessageTypes.unreliable("unreliable"));

    expiredPacket.timestamp = okPacket.timestamp - 100;

    sendPacketThroughPeer(peer1, okPacket);
    sendPacketThroughPeer(peer1, expiredPacket);

    await whileTrue(() => receivedMessages.length === 1);

    // Only one of those should be processed
    expect(receivedMessages.length).toBe(2);
    expect(receivedMessages[1].payload).toEqual("ok");
    expect(peer2.stats.tagged.expired.totalPackets).toEqual(1);
  });

  it("suspends relay when receiving duplicate or expired", async () => {
    extraPeersConfig = {
      relaySuspensionConfig: { relaySuspensionDuration: 5000, relaySuspensionInterval: 0 },
      logLevel: "DEBUG",
    };
    const [peer1, peer2, peer3, peer4] = await createConnectedPeersByQty("room", 4);

    const receivedMessages: { sender: string; room: string; payload: any }[] = [];

    peer2.callback = (sender, room, payload) => {
      receivedMessages.push({ sender, room, payload });
    };

    const expired = createPacketForMessage(peer3, "ok", "room");
    const ok = createPacketForMessage(peer3, "ok", "room");

    expired.timestamp = ok.timestamp - 100;

    const other = createPacketForMessage(peer3, "other", "room");

    // We send the other packet twice, from different peers. Peer 2 should receive it duplicate from peer1
    sendPacketThroughPeer(peer3, other);
    await whileTrue(() => receivedMessages.length === 0);
    sendPacketThroughPeer(peer1, other);

    // We fail only if we timeout
    // @ts-ignore
    await untilTrue(() => peer2.isRelayFromConnectionSuspended(peer1.peerIdOrFail(), peer3.peerIdOrFail()));
    // @ts-ignore
    await untilTrue(() => peer1.isRelayToConnectionSuspended(peer2.peerIdOrFail(), peer3.peerIdOrFail()));

    sendPacketThroughPeer(peer3, ok);
    await whileTrue(() => receivedMessages.length === 1);
    sendPacketThroughPeer(peer4, expired);

    // @ts-ignore
    await untilTrue(() => peer2.isRelayFromConnectionSuspended(peer4.peerIdOrFail(), peer3.peerIdOrFail()));
    // @ts-ignore
    await untilTrue(() => peer4.isRelayToConnectionSuspended(peer2.peerIdOrFail(), peer3.peerIdOrFail()));
  });

  it("consolidates relay suspension request adding pending suspension", () => {});

  it("ignores relay suspension request if only one link remains", () => {});

  it("sends pending succession requests at its interval", () => {});

  it("sends the corresponding packet for a message", () => {});

  it("sends the corresponding packet to valid peers", () => {});

  it("rejects a connection from a peer of another lighthouse or layer", () => {});

  it("rejects a connection from a peer with another protocol version", () => {});

  it("rejects a connection from a peer when it has too many connections", () => {});

  it("updates known peers and rooms with notifications from lighthouse", () => {});

  it("handles authentication", () => {});

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

function sendPacketThroughPeer(peer1: Peer, packet: Packet) {
  // @ts-ignore
  peer1.sendPacket(packet);
}

function createPacketForMessage(peer: Peer, message: any, room: string, messageType: PeerMessageType = PeerMessageTypes.reliable("reliable")) {
  // @ts-ignore
  const [encoding, payload] = peer.getEncodedPayload(message);

  // @ts-ignore
  return peer.buildPacketWithData(messageType, {
    messageData: { room, encoding, payload, dst: [] },
  });
}

function assignId(socket: SocketMock, id: string = "assigned") {
  socket.onmessage({ data: JSON.stringify({ type: ServerMessageType.AssignedId, payload: { id } }) });
}

function openConnection(socket: SocketMock) {
  socket.onmessage({ data: JSON.stringify({ type: ServerMessageType.Open }) });
  socket.onmessage({ data: JSON.stringify({ type: ServerMessageType.ValidationOk }) });
}

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

function delay(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function whileTrue(condition: () => boolean) {
  while (condition()) {
    await delay(5);
  }
}

async function sendMessage(peer1: Peer, peer2: Peer, room: string, message: any, messageType: PeerMessageType = PeerMessageTypes.reliable("reliable")) {
  const peer2MessagePromise = new Promise((resolve) => {
    peer2.callback = (sender, room, payload) => {
      resolve({ sender, room, payload });
    };
  });

  await peer1.sendMessage(room, message, messageType);

  return await peer2MessagePromise;
}

async function untilTrue(condition: () => boolean) {
  await whileTrue(() => !condition());
}
