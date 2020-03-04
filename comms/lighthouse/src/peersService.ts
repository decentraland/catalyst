import { IRealm } from "peerjs-server";
import { PeerInfo, PeerRequest } from "./types";

export enum NotificationType {
  PEER_LEFT_ROOM = "PEER_LEFT_ROOM",
  PEER_LEFT_LAYER = "PEER_LEFT_LAYER",
  PEER_JOINED_LAYER = "PEER_JOINED_LAYER",
  PEER_JOINED_ROOM = "PEER_JOINED_ROOM"
}

require("isomorphic-fetch");

export interface IPeersService {
  notifyPeersById(peerIds: string[], type: NotificationType, payload: object): void;

  getPeerInfo(peerId: string): PeerInfo;
  getPeersInfo(peerIds: string[]): PeerInfo[];

  ensurePeerInfo(peer: PeerRequest): PeerInfo;
}

export class PeersService implements IPeersService {
  private peersTopology: Record<string, string[]> = {};
  private peers: Record<string, PeerInfo> = {};

  constructor(private realmProvider: () => IRealm) {}

  notifyPeers(peers: PeerInfo[], type: NotificationType, payload: object) {
    this.notifyPeersById(
      peers.map(it => it.id),
      type,
      payload
    );
  }

  notifyPeersById(peerIds: string[], type: NotificationType, payload: object) {
    console.log(`Sending ${type} notification to: `, peerIds);
    peerIds.forEach(id => {
      const client = this.peerRealm!.getClientById(id);
      if (client) {
        client.send({
          type,
          src: "__lighthouse_notification__",
          dst: id,
          payload
        });
      }
    });
  }

  updateTopology(peerId: string, connectedPeerIds: string[]) {
    this.peersTopology[peerId] = connectedPeerIds;
  }

  private get peerRealm() {
    return this.realmProvider();
  }

  getConnectedPeers(peerId: string): string[] | undefined {
    return this.peersTopology[peerId];
  }

  peerExistsInRealm(peerId: string) {
    return !!this.peerRealm.getClientById(peerId);
  }

  getPeerInfo(peerId: string): PeerInfo {
    return this.peers[peerId] ?? { id: peerId };
  }

  getPeersInfo(peerIds: string[]): PeerInfo[] {
    return peerIds.map(id => this.getPeerInfo(id));
  }

  ensurePeerInfo(peer: PeerRequest): PeerInfo {
    const peerId = (peer.id ?? peer.peerId)!;
    const existing = this.peers[peerId];

    if (existing) {
      if (existing.protocolVersion) {
        existing.protocolVersion = peer.protocolVersion;
      }
      return existing;
    } else {
      this.peers[peerId] = { id: peerId, protocolVersion: peer.protocolVersion };
      return this.peers[peerId];
    }
  }

  updateUserParcel(peerId: string, parcel?: [number, number]) {
    if (this.peers[peerId]) {
      this.peers[peerId].parcel = parcel;
    }
  }
}
