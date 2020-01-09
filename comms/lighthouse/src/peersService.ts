import { IRealm } from "peerjs-server";
import { PeerInfo } from "./types";

export enum NotificationType {
  PEER_LEFT_ROOM = "PEER_LEFT_ROOM",
  PEER_LEFT_LAYER = "PEER_LEFT_LAYER"
}

export class PeersService {
  constructor(private realmProvider: () => IRealm) {}

  notifyPeers(peers: PeerInfo[], type: NotificationType, payload: object) {
    peers.forEach($ => {
      const client = this.peerRealm!.getClientById($.peerId);
      if (client) {
        client.send({
          type: NotificationType,
          src: "__lighthouse_notification__",
          dst: $.userId,
          payload
        });
      }
    });
  }

  private get peerRealm() {
    return this.realmProvider();
  }
}
