/* eslint-disable @typescript-eslint/ban-types */
import { Island } from '@dcl/archipelago'
import { discretizedPositionDistance, PeerConnectionHint, Position } from 'decentraland-catalyst-utils/Positions'
import { IRealm } from 'peerjs-server'
import { PeerInfo, PeerRequest } from '../types'
import { PeerNotificationType, PeerOutgoingMessage, PeerOutgoingMessageType } from './messageTypes'

require('isomorphic-fetch')

export interface IPeersService {
  notifyPeersById(peerIds: string[], type: PeerNotificationType, payload: object): void

  getPeerInfo(peerId: string): PeerInfo
  getPeersInfo(peerIds: string[]): PeerInfo[]

  ensurePeerInfo(peer: PeerRequest): PeerInfo
  getOptimalConnectionsFor(
    peer: PeerInfo,
    otherPeers: PeerInfo[],
    targetConnections: number,
    maxDistance: number
  ): PeerConnectionHint[]
}

export class PeersService implements IPeersService {
  private peersTopology: Record<string, string[]> = {}

  // This structure contains information of all peers, even those that have disconnected. To know if a peer is disconnected, check the realm
  private peers: Record<string, PeerInfo> = {}

  constructor(
    private realmProvider: () => IRealm,
    private distanceFunction: (p1: Position, p2: Position) => number = discretizedPositionDistance()
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

  notifyPeersById(peerIds: string[], type: PeerNotificationType, payload: object) {
    peerIds.forEach((id) => {
      this.sendMessageToPeer(id, {
        type,
        payload
      })
    })
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

  getPeersInfo(peerIds: string[]): PeerInfo[] {
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
    if (this.peers[peerId]) {
      this.peers[peerId].parcel = parcel
    }
  }

  updatePeerPosition(peerId: string, position?: Position) {
    if (this.peers[peerId]) {
      this.peers[peerId].position = position
    }
  }

  getOptimalConnectionsFor(
    peer: PeerInfo,
    otherPeers: PeerInfo[],
    targetConnections: number,
    maxDistance: number
  ): PeerConnectionHint[] {
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

  sendNotificationToIsland(
    peerChangingId: string,
    island: Island,
    type: PeerOutgoingMessageType.PEER_JOINED_ISLAND | PeerOutgoingMessageType.PEER_LEFT_ISLAND
  ) {
    for (const peer of island.peers) {
      if (peer.id !== peerChangingId) {
        this.sendMessageToPeer(peer.id, {
          type,
          payload: {
            islandId: island.id,
            peerId: peerChangingId
          }
        })
      }
    }
  }

  sendIslandChange(peerChangingId: string, island: Island, fromIsland: Island | undefined) {
    this.sendMessageToPeer(peerChangingId, {
      type: PeerOutgoingMessageType.CHANGE_ISLAND,
      payload: {
        islandId: island.id,
        peers: island.peers.map((it) => ({ id: it.id, position: it.position }))
      }
    })

    this.sendNotificationToIsland(peerChangingId, island, PeerOutgoingMessageType.PEER_JOINED_ISLAND)

    if (fromIsland) {
      this.sendNotificationToIsland(peerChangingId, fromIsland, PeerOutgoingMessageType.PEER_LEFT_ISLAND)
    }
  }
}
