import { RoomsService } from '../src/roomsService'
import { IPeersService, NotificationType } from '../src/peersService'
import { PeerRequest, PeerInfo } from '../src/types'
import { PeerConnectionHint } from 'decentraland-katalyst-utils/Positions'

const { arrayWithExactContents } = jasmine

const layerId = 'blue'

describe('Rooms service', () => {
  let peerService: IPeersService & { sentMessages: [string, any][] }
  let roomsService: RoomsService

  function createPeer() {
    const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString()
    return { id: id, protocolVersion: 99 }
  }

  beforeEach(() => {
    peerService = {
      notifyPeersById(peerIds: string[], type: NotificationType, payload: object) {
        peerIds.forEach((it) => this.sentMessages.push([it, { type, payload }]))
      },
      getPeerInfo(peerId: string) {
        return { id: peerId, protocolVersion: 99 }
      },
      getPeersInfo(peerIds: string[]) {
        return peerIds.map((it) => this.getPeerInfo(it))
      },
      ensurePeerInfo(peer: PeerRequest) {
        return { id: peer.peerId!, protocolVersion: 99 }
      },
      sentMessages: [],
      getOptimalConnectionsFor(
        peer: PeerInfo,
        otherPeers: PeerInfo[],
        targetConnections: number,
        maxDistance: number
      ): PeerConnectionHint[] {
        return []
      }
    }

    roomsService = new RoomsService(layerId, {}, { peersService: peerService })
  })

  it('should allow to add a user to an non-existing room and create it', async () => {
    const peerData = createPeer()
    await roomsService.addPeerToRoom('room', peerData.id)
    expect(roomsService.getPeers('room')).toEqual([peerData])
  })

  it('should allow to add a user to an existing room', async () => {
    const peer1 = createPeer()
    const peer2 = createPeer()

    await roomsService.addPeerToRoom('room', peer1.id)
    await roomsService.addPeerToRoom('room', peer2.id)

    expect(roomsService.getPeers('room')).toEqual(arrayWithExactContents([peer1, peer2]))
  })

  it('should list all the rooms', async () => {
    await roomsService.addPeerToRoom('room1', createPeer().id)
    await roomsService.addPeerToRoom('room2', createPeer().id)

    expect(roomsService.getRoomIds()).toEqual(arrayWithExactContents(['room1', 'room2']))
  })

  it('should list all the rooms that a user is in', async () => {
    await roomsService.addPeerToRoom('room1', createPeer().id)

    const aPeer = createPeer()
    await roomsService.addPeerToRoom('room2', aPeer.id)
    await roomsService.addPeerToRoom('room3', aPeer.id)

    expect(roomsService.getRoomIds({ peerId: aPeer.id })).toEqual(arrayWithExactContents(['room2', 'room3']))
  })

  it('should allow removing a user from a room', async () => {
    const peer1 = createPeer()
    await roomsService.addPeerToRoom('room', peer1.id)

    const peer2 = createPeer()
    await roomsService.addPeerToRoom('room', peer2.id)

    roomsService.removePeerFromRoom('room', peer2.id)

    expect(roomsService.getPeers('room')).toEqual([peer1])
  })

  it('should delete a room if all users are removed', async () => {
    const peer1 = createPeer()
    await roomsService.addPeerToRoom('room', peer1.id)

    roomsService.removePeerFromRoom('room', peer1.id)

    expect(roomsService.getRoomIds()).toEqual([])
  })

  it('should allow removing a user from all rooms', async () => {
    const peer1 = createPeer()
    const peer2 = createPeer()

    await roomsService.addPeerToRoom('room1', peer1.id)
    await roomsService.addPeerToRoom('room2', peer1.id)
    await roomsService.addPeerToRoom('room1', peer2.id)
    await roomsService.addPeerToRoom('room2', peer2.id)

    roomsService.removePeer(peer1.id)

    expect(roomsService.getPeers('room1')).toEqual([peer2])
    expect(roomsService.getPeers('room2')).toEqual([peer2])
  })

  it('should notify when a user is removed from a room', async () => {
    const peer1 = createPeer()
    const peer2 = createPeer()

    await roomsService.addPeerToRoom('room1', peer1.id)
    await roomsService.addPeerToRoom('room1', peer2.id)

    roomsService.removePeerFromRoom('room1', peer1.id)

    const leftMessages = peerService.sentMessages.filter(([id, message]) => message.type === 'PEER_LEFT_ROOM')

    expect(leftMessages.length).toEqual(1)

    const [[id, message]] = leftMessages

    expect(id).toEqual(peer2.id)
    expect(message.payload.id).toEqual(peer1.id)
    expect(message.payload.roomId).toEqual('room1')
  })
})
