import { RoomsService } from "../src/roomsService";
import { IPeersService, NotificationType } from "../src/peersService";
import { PeerRequest } from "../src/types";

const { arrayWithExactContents } = jasmine;

const layerId = "blue";

describe("Rooms service", () => {
  let peerService: IPeersService & { sentMessages: [string, any][] };
  let roomsService: RoomsService;

  function createPeer() {
    const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
    return { id: id, protocolVersion: 99 };
  }

  beforeEach(() => {
    peerService = {
      notifyPeersById(peerIds: string[], type: NotificationType, payload: object) {
        peerIds.forEach(it => this.sentMessages.push([it, { type, payload }]));
      },
      getPeerInfo(peerId: string) {
        return { id: peerId, protocolVersion: 99 };
      },
      getPeersInfo(peerIds: string[]) {
        return peerIds.map(it => this.getPeerInfo(it));
      },
      ensurePeerInfo(peer: PeerRequest) {
        return { id: peer.peerId!, protocolVersion: 99 };
      },
      sentMessages: []
    };

    roomsService = new RoomsService(layerId, {}, { peersService: peerService });
  });

  it("should allow to add a user to an non-existing room and create it", async () => {
    const peerData = createPeer();
    await roomsService.addUserToRoom("room", peerData.id);
    expect(roomsService.getUsers("room")).toEqual([peerData]);
  });

  it("should allow to add a user to an existing room", async () => {
    const peer1 = createPeer();
    const peer2 = createPeer();

    await roomsService.addUserToRoom("room", peer1.id);
    await roomsService.addUserToRoom("room", peer2.id);

    expect(roomsService.getUsers("room")).toEqual(arrayWithExactContents([peer1, peer2]));
  });

  it("should list all the rooms", async () => {
    await roomsService.addUserToRoom("room1", createPeer().id);
    await roomsService.addUserToRoom("room2", createPeer().id);

    expect(roomsService.getRoomIds()).toEqual(arrayWithExactContents(["room1", "room2"]));
  });

  it("should list all the rooms that a user is in", async () => {
    await roomsService.addUserToRoom("room1", createPeer().id);

    const aPeer = createPeer();
    await roomsService.addUserToRoom("room2", aPeer.id);
    await roomsService.addUserToRoom("room3", aPeer.id);

    expect(roomsService.getRoomIds({ peerId: aPeer.id })).toEqual(arrayWithExactContents(["room2", "room3"]));
  });

  it("should allow removing a user from a room", async () => {
    const peer1 = createPeer();
    await roomsService.addUserToRoom("room", peer1.id);

    const peer2 = createPeer();
    await roomsService.addUserToRoom("room", peer2.id);

    roomsService.removeUserFromRoom("room", peer2.id);

    expect(roomsService.getUsers("room")).toEqual([peer1]);
  });

  it("should delete a room if all users are removed", async () => {
    const peer1 = createPeer();
    await roomsService.addUserToRoom("room", peer1.id);

    roomsService.removeUserFromRoom("room", peer1.id);

    expect(roomsService.getRoomIds()).toEqual([]);
  });

  it("should allow removing a user from all rooms", async () => {
    const peer1 = createPeer();
    const peer2 = createPeer();

    await roomsService.addUserToRoom("room1", peer1.id);
    await roomsService.addUserToRoom("room2", peer1.id);
    await roomsService.addUserToRoom("room1", peer2.id);
    await roomsService.addUserToRoom("room2", peer2.id);

    roomsService.removeUser(peer1.id);

    expect(roomsService.getUsers("room1")).toEqual([peer2]);
    expect(roomsService.getUsers("room2")).toEqual([peer2]);
  });

  it("should notify when a user is removed from a room", async () => {
    const peer1 = createPeer();
    const peer2 = createPeer();

    await roomsService.addUserToRoom("room1", peer1.id);
    await roomsService.addUserToRoom("room1", peer2.id);

    roomsService.removeUserFromRoom("room1", peer1.id);

    const leftMessages = peerService.sentMessages.filter(([id, message]) => message.type === "PEER_LEFT_ROOM");

    expect(leftMessages.length).toEqual(1);

    const [[id, message]] = leftMessages;

    expect(id).toEqual(peer2.id);
    expect(message.payload.id).toEqual(peer1.id);
    expect(message.payload.roomId).toEqual("room1");
  });
});
