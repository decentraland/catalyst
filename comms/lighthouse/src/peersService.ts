import { IRealm } from "peerjs-server";
import { PeerInfo } from "./types";
import { serverStorage } from "./simpleStorage";
import { StorageKeys } from "./storageKeys";
import { util } from "../../peer/src/peerjs-server-connector/util";
import * as wrtc from "wrtc";
import { Peer } from "../../peer/src/Peer";

export enum NotificationType {
  PEER_LEFT_ROOM = "PEER_LEFT_ROOM",
  PEER_LEFT_LAYER = "PEER_LEFT_LAYER",
  PEER_JOINED_LAYER = "PEER_JOINED_LAYER",
  PEER_JOINED_ROOM = "PEER_JOINED_ROOM"
}

async function getPeerToken(layerId: string) {
  return await serverStorage.getOrSetString(`${StorageKeys.PEER_TOKEN}-${layerId}`, util.generateToken(64));
}

require("isomorphic-fetch");

export class PeersService {
  constructor(private realmProvider: () => IRealm, private lighthouseSecure: boolean, private lighthousePort: number) {}

  notifyPeers(peers: PeerInfo[], type: NotificationType, payload: object) {
    console.log(`Sending ${type} notification to: `, peers);
    peers.forEach($ => {
      const client = this.peerRealm!.getClientById($.peerId);
      if (client) {
        client.send({
          type,
          src: "__lighthouse_notification__",
          dst: $.userId,
          payload
        });
      }
    });
  }

  async createServerPeer(layerId: string) {
    const peerToken = await getPeerToken(layerId);
    return new Peer(
      `${this.lighthouseSecure ? "https" : "http"}://localhost:${this.lighthousePort}`,
      "lighthouse",
      (sender, room, payload) => {
        const message = JSON.stringify(payload, null, 3);
        console.log(`Received message from ${sender} in ${room}: ${message}`);
      },
      {
        wrtc,
        socketBuilder: url => new WebSocket(url),
        token: peerToken,
        connectionConfig: {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302"
            },
            {
              urls: "stun:stun2.l.google.com:19302"
            },
            {
              urls: "stun:stun3.l.google.com:19302"
            },
            {
              urls: "stun:stun4.l.google.com:19302"
            }
          ]
        }
      }
    );
  }

  private get peerRealm() {
    return this.realmProvider();
  }
}
