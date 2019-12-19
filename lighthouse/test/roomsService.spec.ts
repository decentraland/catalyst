import { RoomsService } from "../src/roomsService";

const { arrayWithExactContents } = jasmine;

describe("Rooms service", () => {
  let peerLibrary: any;
  let realm: any;
  let roomsService: RoomsService;

  const lighthouseId = "lighthouse";
  const lighthousePeerData = { userId: lighthouseId, peerId: lighthouseId };

  function createPeer() {
    const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
    return { peerId: id, userId: id };
  }

  beforeEach(() => {
    peerLibrary = {
      nickname: lighthouseId,
      joinRoom(roomId: string) {
        roomsService.addUserToRoom(roomId, lighthousePeerData);
      },
      disconnectFrom(x) {}
    };

    realm = {
      getClientById(id: string) {}
    };

    roomsService = new RoomsService({
      serverPeerProvider: () => peerLibrary,
      realmProvider: () => realm
    });
  });

  it("should allow to add a user to an non-existing room and create it", async () => {
    const peerData = createPeer();
    await roomsService.addUserToRoom("room", peerData);
    expect(roomsService.getUsers("room")).toEqual([peerData]);
  });

  it("should allow to add a user to an existing room", async () => {
    const peer1 = createPeer();
    const peer2 = createPeer();

    await roomsService.addUserToRoom("room", peer1);
    await roomsService.addUserToRoom("room", peer2);

    expect(roomsService.getUsers("room")).toEqual(
      arrayWithExactContents([peer1, peer2])
    );
  });

  it("should list all the rooms", async () => {
    await roomsService.addUserToRoom("room1", createPeer());
    await roomsService.addUserToRoom("room2", createPeer());

    expect(roomsService.getRoomIds()).toEqual(
      arrayWithExactContents(["room1", "room2"])
    );
  });

  it("should list all the rooms that a user is in", async () => {
    await roomsService.addUserToRoom("room1", createPeer());

    const aPeer = createPeer();
    await roomsService.addUserToRoom("room2", aPeer);
    await roomsService.addUserToRoom("room3", aPeer);

    expect(roomsService.getRoomIds({ userId: aPeer.userId })).toEqual(
      arrayWithExactContents(["room2", "room3"])
    );
  });

  it("should add peer server to a new room if relay is conigured", async () => {
    roomsService = new RoomsService({
      serverPeerProvider: () => peerLibrary,
      realmProvider: () => realm,
      relay: true
    });

    const peer1 = createPeer();
    await roomsService.addUserToRoom("room", peer1);
    expect(roomsService.getUsers("room")).toEqual(
      arrayWithExactContents([
        { userId: peer1.userId, peerId: lighthouseId },
        lighthousePeerData
      ])
    );
  });

  it("should allow removing a user from a room", async () => {
    const peer1 = createPeer();
    await roomsService.addUserToRoom("room", peer1);

    const peer2 = createPeer();
    await roomsService.addUserToRoom("room", peer2);

    roomsService.removeUserFromRoom("room", peer2.userId);

    expect(roomsService.getUsers("room")).toEqual([peer1]);
  });

  it("should delete a room if all users are removed", async () => {
    const peer1 = createPeer();
    await roomsService.addUserToRoom("room", peer1);

    roomsService.removeUserFromRoom("room", peer1.userId);

    expect(roomsService.getRoomIds()).toEqual([]);
  });

  it("should allow removing a user from all rooms", async () => {
    const peer1 = createPeer();
    const peer2 = createPeer();

    await roomsService.addUserToRoom("room1", peer1);
    await roomsService.addUserToRoom("room2", peer1);
    await roomsService.addUserToRoom("room1", peer2);
    await roomsService.addUserToRoom("room2", peer2);

    roomsService.removeUser(peer1.userId);

    expect(roomsService.getUsers("room1")).toEqual([peer2]);
    expect(roomsService.getUsers("room2")).toEqual([peer2]);
  });

  it("should notify when a user is removed from a room", async () => {
    const sentMessages: [string, any][] = [];

    realm = {
      getClientById(id: string) {
        return {
          id: id,
          send: data => sentMessages.push([id, data])
        };
      }
    };

    const peer1 = createPeer();
    const peer2 = createPeer();

    await roomsService.addUserToRoom("room1", peer1);
    await roomsService.addUserToRoom("room1", peer2);

    roomsService.removeUserFromRoom("room1", peer1.userId);

    const [[id, message]] = sentMessages;
    expect(id).toEqual(peer2.userId);
    expect(message.type).toEqual("PEER_LEFT_ROOM");
    expect(message.payload.userId).toEqual(peer1.userId);
    expect(message.payload.roomId).toEqual("room1");
  });
});
