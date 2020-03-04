import { IPeersService, NotificationType } from "./peersService";
import { Room, PeerInfo } from "./types";
import { removeUserAndNotify } from "./utils";

type RoomsFilter = Partial<{
  peerId: string;
}>;

type RoomsServiceConfig = {
  peersService: IPeersService;
};

function newRoom(roomId: string): Room {
  return { id: roomId, users: [] };
}

export class RoomsService {
  constructor(layer: string, private rooms: Record<string, Room>, private config: RoomsServiceConfig) {}

  private get peersService() {
    return this.config.peersService;
  }

  getRoomIds(filter?: RoomsFilter): string[] {
    const peerId = filter?.peerId;

    return peerId
      ? Object.entries(this.rooms)
          .filter(([, room]) => room.users.includes(peerId))
          .map(([id]) => id)
      : Object.keys(this.rooms);
  }

  getUsers(roomId: string): PeerInfo[] {
    return this.peersService.getPeersInfo(this.rooms[roomId]?.users);
  }

  async addUserToRoom(roomId: string, peerId: string) {
    let room = this.rooms[roomId];

    if (!room) {
      this.rooms[roomId] = room = newRoom(roomId);
    }

    if (!room.users.includes(peerId)) {
      const peersToNotify = room.users.slice();
      room.users.push(peerId);
      this.config.peersService?.notifyPeersById(peersToNotify, NotificationType.PEER_JOINED_ROOM, {
        id: peerId,
        userId: peerId,
        peerId: peerId,
        roomId
      });
    }

    return room;
  }

  removeUserFromRoom(roomId: string, peerId: string) {
    return removeUserAndNotify(this.rooms, roomId, peerId, NotificationType.PEER_LEFT_ROOM, "roomId", this.peersService);
  }

  removeUser(peerId: string) {
    Object.keys(this.rooms).forEach(room => this.removeUserFromRoom(room, peerId));
  }
}
