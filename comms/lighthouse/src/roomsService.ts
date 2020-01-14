import { Peer } from "../../peer/src/Peer";
import { PeersService, NotificationType } from "./peersService";
import { Room, PeerInfo } from "./types";
import { getServerPeer, removeUserAndNotify } from "./utils";

type RoomsFilter = Partial<{
  userId: string;
}>;

type RoomsServiceConfig = Partial<{
  serverPeerEnabled: boolean;
  serverPeerProvider: () => Peer | undefined;
  peersService: PeersService;
}>;

function newRoom(roomId: string): Room {
  return { id: roomId, users: [] };
}

export class RoomsService {
  constructor(layer: string, private rooms: Record<string, Room>, private config: RoomsServiceConfig) {}

  private get peersService() {
    return this.config.peersService;
  }

  getRoomIds(filter?: RoomsFilter): string[] {
    const userId = filter?.userId;

    return userId
      ? Object.entries(this.rooms)
          .filter(([, room]) => room.users.some(user => user.userId === userId))
          .map(([id]) => id)
      : Object.keys(this.rooms);
  }

  getUsers(roomId: string): PeerInfo[] {
    return this.rooms[roomId]?.users;
  }

  async addUserToRoom(roomId: string, peer: PeerInfo) {
    let room = this.rooms[roomId];

    const serverPeer = getServerPeer(this.config.serverPeerProvider);

    if (!room) {
      this.rooms[roomId] = room = newRoom(roomId);
      // if relaying peer exists, add to room when it's created

      if (this.config.serverPeerEnabled && serverPeer) {
        await serverPeer.joinRoom(roomId);
      }
    }

    if (!room.users.some($ => $.userId === peer.userId)) {
      const peersToNotify = room.users.slice();
      room.users.push(peer);
      this.config.peersService?.notifyPeers(peersToNotify, NotificationType.PEER_JOINED_ROOM, {
        userId: peer.userId,
        peerId: peer.peerId,
        roomId
      });
    }

    return room;
  }

  removeUserFromRoom(roomId: string, userId: string) {
    return removeUserAndNotify(this.rooms, roomId, userId, NotificationType.PEER_LEFT_ROOM, "roomId", this.peersService);
  }

  removeUser(userId: string) {
    Object.keys(this.rooms).forEach(room => this.removeUserFromRoom(room, userId));
    const serverPeer = getServerPeer(this.config.serverPeerProvider);
    if (serverPeer) {
      serverPeer.disconnectFrom(userId);
    }
  }
}
