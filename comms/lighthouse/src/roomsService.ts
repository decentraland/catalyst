import { removePeerAndNotify } from './misc/utils'
import { PeerOutgoingMessageType } from './peers/messageTypes'
import { IPeersService } from './peers/peersService'
import { PeerInfo, Room } from './types'

type RoomsFilter = Partial<{
  peerId: string
}>

type RoomsServiceConfig = {
  peersService: IPeersService
}

function newRoom(roomId: string): Room {
  return { id: roomId, peers: [] }
}

export class RoomsService {
  constructor(layer: string, private rooms: Record<string, Room>, private config: RoomsServiceConfig) {}

  private get peersService() {
    return this.config.peersService
  }

  getRoomIds(filter?: RoomsFilter): string[] {
    const peerId = filter?.peerId

    return peerId
      ? Object.entries(this.rooms)
          .filter(([, room]) => room.peers.includes(peerId))
          .map(([id]) => id)
      : Object.keys(this.rooms)
  }

  getPeers(roomId: string): PeerInfo[] {
    return this.peersService.getPeersInfo(this.rooms[roomId]?.peers)
  }

  async addPeerToRoom(roomId: string, peerId: string) {
    let room = this.rooms[roomId]

    if (!room) {
      this.rooms[roomId] = room = newRoom(roomId)
    }

    if (!room.peers.includes(peerId)) {
      const peersToNotify = room.peers.slice()
      room.peers.push(peerId)
      this.config.peersService?.notifyPeersById(peersToNotify, PeerOutgoingMessageType.PEER_JOINED_ROOM, {
        id: peerId,
        userId: peerId,
        peerId,
        roomId
      })
    }

    return room
  }

  removePeerFromRoom(roomId: string, peerId: string) {
    const { container } = removePeerAndNotify(
      this.rooms,
      roomId,
      peerId,
      PeerOutgoingMessageType.PEER_LEFT_ROOM,
      'roomId',
      this.peersService
    )
    return container
  }

  removePeer(peerId: string) {
    Object.keys(this.rooms).forEach((room) => this.removePeerFromRoom(room, peerId))
  }
}
