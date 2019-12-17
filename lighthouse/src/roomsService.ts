import { PeerConnectionData } from "../../peer/src/types";
import { Peer } from "../../peer/src/Peer";
import { IRealm } from "peerjs-server";

type RoomsFilter = Partial<{
  userId: string;
}>;

type RoomsServiceConfig = Partial<{
  relay: boolean;
  serverPeerProvider: () => Peer;
  realmProvider: () => IRealm;
}>;

export class RoomsService {
  private rooms: Record<string, PeerConnectionData[]> = {};

  constructor(private config: RoomsServiceConfig) {}

  private get serverPeer() {
    return this.config.serverPeerProvider
      ? this.config.serverPeerProvider()
      : undefined;
  }

  private get peerRealm() {
    return this.config.realmProvider ? this.config.realmProvider() : undefined;
  }

  getRoomIds(filter: RoomsFilter): string[] {
    const { userId } = filter;

    return userId
      ? Object.entries(this.rooms)
          .filter(([, users]) => users.some(user => user.userId === userId))
          .map(([id]) => id)
      : Object.keys(this.rooms);
  }

  getUsers(roomId: string): PeerConnectionData[] {
    return this.rooms[roomId];
  }

  async addUserToRoom(roomId: string, peer: PeerConnectionData) {
    let room = this.rooms[roomId];

    if (!room) {
      this.rooms[roomId] = room = [];
      // if relaying peer exists, add to room when it's created
      if (this.config.relay && this.serverPeer) {
        await this.serverPeer.joinRoom(roomId);
      }
    }

    if (!room.some($ => $.userId === peer.userId)) {
      room.push(
        this.config.relay && this.serverPeer
          ? { ...peer, peerId: this.serverPeer.nickname }
          : peer
      );
    }

    return room;
  }

  removeUserFromRoom(roomId: string, userId: string) {
    let room = this.rooms[roomId];
    if (room) {
      const index = room.findIndex($ => $.userId === userId);
      if (index !== -1) {
        const [peerData] = room.splice(index, 1);

        if (this.peerRealm) {
          //This particular logic may need to be extracted to another service of some kind
          room.forEach($ => {
            const client = this.peerRealm!.getClientById($.userId);
            if (client) {
              client.send({
                type: "PEER_LEFT_ROOM",
                src: "__lighthouse__",
                dst: $.userId,
                payload: {
                  userId: peerData.userId,
                  peerId: peerData.peerId,
                  roomId
                }
              });
            }
          });
        }
      }
    }
    if (room.length === 0) {
      delete this.rooms[roomId];
    }
  }

  removeUser(userId: string) {
    Object.keys(this.rooms).forEach(room =>
      this.removeUserFromRoom(room, userId)
    );
    if (this.serverPeer) {
      this.serverPeer.disconnectFrom(userId);
    }
  }
}
