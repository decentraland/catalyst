import { IRealm } from "peerjs-server";
import { PeerInfo, PeerRequest,PeerConnectionHint } from "./types";
import { Position3D, discretizedPositionDistance } from "decentraland-katalyst-utils/Positions";

export enum NotificationType {
  PEER_LEFT_ROOM = "PEER_LEFT_ROOM",
  PEER_LEFT_LAYER = "PEER_LEFT_LAYER",
  PEER_JOINED_LAYER = "PEER_JOINED_LAYER",
  PEER_JOINED_ROOM = "PEER_JOINED_ROOM"
}

require("isomorphic-fetch");

export interface IPeersService<PositionType = Position3D> {
  notifyPeersById(peerIds: string[], type: NotificationType, payload: object): void;

  getPeerInfo(peerId: string): PeerInfo<PositionType>;
  getPeersInfo(peerIds: string[]): PeerInfo<PositionType>[];

  ensurePeerInfo(peer: PeerRequest): PeerInfo<PositionType>;
  getOptimalConnectionsFor(peer: PeerInfo<PositionType>, otherPeers: PeerInfo<PositionType>[], targetConnections: number): PeerConnectionHint[];
}

export class PeersService<PositionType = Position3D> implements IPeersService<PositionType> {
  private peersTopology: Record<string, string[]> = {};
  private peers: Record<string, PeerInfo<PositionType>> = {};

  constructor(private realmProvider: () => IRealm, private distanceFunction: (p1: PositionType, p2: PositionType) => number = discretizedPositionDistance) {}

  notifyPeers(peers: PeerInfo<any>[], type: NotificationType, payload: object) {
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

  getPeerInfo(peerId: string): PeerInfo<PositionType> {
    return this.peers[peerId] ?? { id: peerId };
  }

  getPeersInfo(peerIds: string[]): PeerInfo<PositionType>[] {
    return peerIds.map(id => this.getPeerInfo(id));
  }

  ensurePeerInfo(peer: PeerRequest): PeerInfo<PositionType> {
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

  updatePeerParcel(peerId: string, parcel?: [number, number]) {
    if (this.peers[peerId]) {
      this.peers[peerId].parcel = parcel;
    }
  }

  updatePeerPosition(peerId: string, position?: PositionType) {
    if (this.peers[peerId]) {
      this.peers[peerId].position = position;
    }
  }

  getOptimalConnectionsFor(peer: PeerInfo<PositionType>, otherPeers: PeerInfo<PositionType>[], targetConnections: number): PeerConnectionHint[] {
    const hints: PeerConnectionHint[] = [];

    otherPeers.forEach(it => {
      if (it.id !== peer.id && it.position) {
        hints.push({
          id: it.id,
          distance: this.distanceFunction(peer.position!, it.position)
        });
      }
    });

    return hints.sort((h1, h2) => {
      const distanceDiff = h1.distance - h2.distance
      // If the distance is the same, we randomize
      return distanceDiff === 0 ? Math.random() : distanceDiff
    }).slice(0, targetConnections);
  }
}
