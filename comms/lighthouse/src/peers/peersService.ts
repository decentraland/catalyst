/* eslint-disable @typescript-eslint/ban-types */
import { discretizedPositionDistanceXZ, PeerConnectionHint, Position3D } from '@dcl/catalyst-node-commons'
import { Island } from '@dcl/archipelago'
import { LighthouseConfig } from '../config/configService'
import { IRealm } from '../peerjs-server'
import { AppServices, PeerInfo, PeerRequest, PeerTopologyInfo } from '../types'
import { PeerOutgoingMessage, PeerOutgoingMessageType } from './protocol/messageTypes'

require('isomorphic-fetch')

export interface IPeersService {
  getPeerInfo(peerId: string): PeerInfo
  getPeersInfo(peerIds: string[]): PeerInfo[]

  ensurePeerInfo(peer: PeerRequest): PeerInfo
  getOptimalConnectionsFor(peer: PeerInfo, otherPeers: PeerInfo[], maxDistance: number): PeerConnectionHint[]
}

export class PeersService implements IPeersService {
  private peersTopology: Record<string, string[]> = {}

  // This structure may contain information of peers that have already disconnected. To know if a peer is disconnected, check the realm
  private peers: Record<string, PeerInfo> = {}

  constructor(
    private realmProvider: () => IRealm,
    private services: Pick<AppServices, 'configService' | 'archipelagoService'>,
    private distanceFunction: (p1: Position3D, p2: Position3D) => number = discretizedPositionDistanceXZ()
  ) {}

  sendMessageToPeer(peerId: string, message: Omit<PeerOutgoingMessage, 'src' | 'dst'>) {
    const client = this.peerRealm.getClientById(peerId)

    if (client) {
      client.send({
        ...message,
        dst: peerId,
        src: '__lighthouse__'
      })
    }
  }

  updateTopology(peerId: string, connectedPeerIds: string[]) {
    this.peersTopology[peerId] = connectedPeerIds
  }

  private get peerRealm() {
    return this.realmProvider()
  }

  getConnectedPeers(peerId: string): string[] | undefined {
    return this.peersTopology[peerId]
  }

  setPeerAddress(peerId: string, address: string) {
    const peerInfo = this.ensurePeerInfo({ id: peerId })
    peerInfo.address = address
  }

  existsPeerWithAddress(address: string) {
    return this.realmProvider()
      .getClientsIds()
      .some((it) => this.getPeerInfo(it)?.address?.toLowerCase() === address.toLowerCase())
  }

  peerExistsInRealm(peerId: string) {
    return !!this.peerRealm.getClientById(peerId)
  }

  getPeerInfo(peerId: string): PeerInfo {
    const client = this.peerRealm.getClientById(peerId)
    const peer = this.peers[peerId] ?? { id: peerId }

    if (client) {
      peer.lastPing = client.getLastPing()
    }

    return peer
  }

  getPeersInfo(peerIds?: string[]): PeerInfo[] {
    if (!peerIds) peerIds = Object.keys(this.peers)

    return peerIds.map((id) => this.getPeerInfo(id))
  }

  ensurePeerInfo(peer: PeerRequest): PeerInfo {
    const peerId = (peer.id ?? peer.peerId)!
    const existing = this.peers[peerId]

    if (existing) {
      if (peer.protocolVersion) {
        existing.protocolVersion = peer.protocolVersion
      }
      return existing
    } else {
      this.peers[peerId] = { id: peerId, protocolVersion: peer.protocolVersion }
      return this.peers[peerId]
    }
  }

  updatePeerParcel(peerId: string, parcel?: [number, number]) {
    const peerInfo = this.ensurePeerInfo({ id: peerId })
    peerInfo.parcel = parcel
  }

  updatePeerPosition(peerId: string, position?: Position3D) {
    const peerInfo = this.ensurePeerInfo({ id: peerId })
    peerInfo.position = position
  }

  getOptimalConnectionsFor(peer: PeerInfo, otherPeers: PeerInfo[], maxDistance: number): PeerConnectionHint[] {
    const hints: PeerConnectionHint[] = []

    otherPeers.forEach((it) => {
      if (it.id !== peer.id && it.position) {
        const distance = this.distanceFunction(peer.position!, it.position)
        if (distance <= maxDistance) {
          hints.push({
            id: it.id,
            distance,
            position: it.position
          })
        }
      }
    })

    return (
      hints
        .sort((h1, h2) => {
          const distanceDiff = h1.distance - h2.distance
          // If the distance is the same, we randomize
          return distanceDiff === 0 ? Math.random() : distanceDiff
        })
        // We don't send more than 100 peer positions for now
        .slice(0, 100)
    )
  }

  sendUpdateToIsland(
    peerId: string,
    island: Island,
    type: PeerOutgoingMessageType.PEER_JOINED_ISLAND | PeerOutgoingMessageType.PEER_LEFT_ISLAND
  ) {
    const info = this.getPeerInfo(peerId)

    if (!info.position) {
      console.warn(
        `Tried to send updates of a peer ${peerId} for which we don't have a position. This shouldn't happen.`
      )
      return
    }

    for (const peer of island.peers) {
      if (peer.id !== info.id) {
        this.sendMessageToPeer(peer.id, {
          type,
          payload: {
            islandId: island.id,
            peer: { id: info.id, position: info.position }
          }
        })
      }
    }
  }

  getActivePeersCount() {
    return this.peerRealm.getClientsCount()
  }

  notifyIslandChange(peerChangingId: string, island: Island, fromIsland: Island | undefined) {
    this.sendMessageToPeer(peerChangingId, {
      type: PeerOutgoingMessageType.CHANGE_ISLAND,
      payload: {
        islandId: island.id,
        peers: island.peers.map((it) => ({ id: it.id, position: it.position }))
      }
    })

    this.sendUpdateToIsland(peerChangingId, island, PeerOutgoingMessageType.PEER_JOINED_ISLAND)

    if (fromIsland) {
      this.sendUpdateToIsland(peerChangingId, fromIsland, PeerOutgoingMessageType.PEER_LEFT_ISLAND)
    }
  }

  getUsersParcels(): [number, number][] {
    const result: [number, number][] = []

    for (const id of this.peerRealm.getClientsIds()) {
      const parcel = this.peers[id]?.parcel
      if (parcel) {
        result.push(parcel)
      }
    }

    return result
  }

  getConnectedPeersInfo(): { ok: true; peers: PeerInfo[] } | { ok: false; message: string } {
    const peersCount = this.getActivePeersCount()

    if (peersCount >= this.services.configService.get(LighthouseConfig.HIGH_LOAD_PEERS_COUNT))
      return { ok: false, message: 'Cannot query peers during high load' }

    return { ok: true, peers: this.getPeersInfo(this.realmProvider().getClientsIds()) }
  }

  clearPeer(peerId: string) {
    delete this.peers[peerId]
    delete this.peersTopology[peerId]
  }

  clearNotConnectedPeers() {
    for (const id in this.peers) {
      if (!this.realmProvider().hasClient(id)) {
        console.warn(`Clearing peer ${id} because it wasn't connected to the lighthouse`)
        this.clearPeer(id)
        this.services.archipelagoService().clearPeer(id)
      }
    }
  }

  getTopology(): { ok: true; topology: PeerTopologyInfo[] } | { ok: false; message: string } {
    const peersCount = this.getActivePeersCount()

    if (peersCount >= this.services.configService.get(LighthouseConfig.HIGH_LOAD_PEERS_COUNT))
      return { ok: false, message: 'Cannot query topology during high load' }

    return {
      ok: true,
      topology: Object.entries(this.peersTopology).map(([id, connectedPeers]) => ({ id, connectedPeers }))
    }
  }
}
