import { IRealm } from "peerjs-server";
import { PeerInfo, PeerRequest, Position3D, isPosition2D, isPosition3D, PeerConnectionHint } from "./types";

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

function positionDistance<PositionType>(a: PositionType, b: PositionType) {
  let dx = 0;
  let dy = 0;
  let dz = 0;

  if (isPosition2D(a) || isPosition3D(a)) {
    dx = a[0] - b[0];
    dy = a[1] - b[1];
  }

  if (isPosition3D(a)) {
    dz = a[2] - b[2];
  }

  return dx * dx + dy * dy + dz * dz;
}

export class PeersService<PositionType = Position3D> implements IPeersService<PositionType> {
  private peersTopology: Record<string, string[]> = {};
  private peers: Record<string, PeerInfo<PositionType>> = {};

  constructor(private realmProvider: () => IRealm, private distanceFunction: (p1: PositionType, p2: PositionType) => number = positionDistance) {}

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

    return hints.sort((h1, h2) => h1.distance - h2.distance).slice(0, targetConnections);
  }
}
