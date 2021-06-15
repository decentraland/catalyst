/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  PeerOutgoingMessage,
  PeerOutgoingMessageContent,
  PeerOutgoingMessageType,
  PeerWithPosition
} from 'comms-protocol/messageTypes'
import { future } from 'fp-future'
import { Position3D } from '../src'
import { PEER_CONSTANTS } from '../src/constants'
import { PeerMessageType, PeerMessageTypes } from '../src/messageTypes'
import { Peer } from '../src/Peer'
import { ServerMessageType } from '../src/peerjs-server-connector/enums'
import { SocketType } from '../src/peerjs-server-connector/socket'
import { Packet } from '../src/proto/peer_protobuf'
import { TimeKeeper } from '../src/TimeKeeper'
import { MinPeerData, PacketCallback, PeerConfig } from '../src/types'

const messageHandler: PacketCallback = (sender, room, payload) => {
  // console.log(`Received message from ${sender} in ${room}`, payload);
}

type PositionedPeer = {
  position: Position3D
  peer: Peer
}

describe('Peer Integration Test', function () {
  const DEFAULT_LIGHTHOUSE = 'http://notimportant:8888'

  let lighthouses: Record<string, Record<string, MinPeerData & { islandId?: string }>>

  let sockets: Record<string, SocketMock>

  let extraPeersConfig: Partial<PeerConfig>

  // let peerPositions: Record<string, Position3D>;

  class SocketMock implements SocketType {
    closed: boolean = false
    onmessage: any = () => {}
    onclose: any = () => {}

    set onopen(f: any) {
      setTimeout(f, 0)
    }

    readyState: number = 1

    constructor(public destinations: SocketMock[]) {
      for (const destination of destinations) {
        destination.destinations.push(this)
      }
    }

    close(code?: number, reason?: string): void {
      this.closed = true
    }

    send(data: string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView): void {
      checkHeartbeat(this, data)
      this.destinations.forEach(($) => $.onmessage({ data }))
    }
  }

  function checkHeartbeat(socket: SocketMock, jsonData: any) {
    if (typeof jsonData === 'string') {
      try {
        const data = JSON.parse(jsonData)
        const position = data?.payload?.position
        if (data?.type === ServerMessageType.Heartbeat && position) {
          const peerId = findPeerIdBySocket(socket)
          if (peerId) {
            Object.values(lighthouses).forEach((lighthouse) => {
              const peer = lighthouse[peerId] ?? { id: peerId, position: position }
              peer.position = position
              lighthouse[peerId] = peer
            })
          }
        }
      } catch (e) {
        // ignored
      }
    }
  }

  function findPeerIdBySocket(socket: SocketMock) {
    return Object.keys(sockets).find((peerId) => sockets[peerId] === socket)
  }

  function getLighthouse(lighthouse: string = DEFAULT_LIGHTHOUSE) {
    let aLighthouse = lighthouses[lighthouse]
    if (!aLighthouse) {
      aLighthouse = lighthouses[lighthouse] = {}
    }

    return aLighthouse
  }

  function createSocket(peerId: string, destinations: SocketMock[] = []) {
    const socket = new SocketMock(destinations)

    sockets[peerId] = socket

    return socket
  }

  function sendMessageToSocket(
    peerId: string,
    content: PeerOutgoingMessageContent,
    socket: SocketMock = sockets[peerId]
  ) {
    const message: PeerOutgoingMessage = { src: '__lighthouse__', dst: peerId, ...content }

    socket.onmessage({ data: JSON.stringify(message) })
  }

  function getIslandPeers(islandId: string, lighthouse: string = DEFAULT_LIGHTHOUSE) {
    return Object.values(getLighthouse(lighthouse)).filter(
      (it) => it.position && it.islandId === islandId
    ) as PeerWithPosition[]
  }

  async function createPeer(
    peerId: string,
    socketDestination: SocketMock[] = [],
    islandId: string = 'I1',
    position: Position3D = [0, 0, 0],
    lighthouse: string = DEFAULT_LIGHTHOUSE,
    callback: PacketCallback = messageHandler
  ): Promise<[SocketMock, Peer]> {
    const socket = createSocket(peerId, socketDestination)

    const peer = new Peer(lighthouse, peerId, callback, {
      socketBuilder: () => socket,
      heartbeatInterval: 0.1,
      positionConfig: {
        selfPosition: () => position
      },
      ...extraPeersConfig
    })

    putPeerInIsland(peerId, islandId, undefined, position, lighthouse)

    return [socket, peer]
  }

  function putPeerInIsland(
    peerId: string,
    islandId: string,
    socket?: SocketMock,
    position: Position3D = [0, 0, 0],
    lighthouse: string = DEFAULT_LIGHTHOUSE
  ) {
    getLighthouse(lighthouse)[peerId] = { id: peerId, position, islandId }

    sendMessageToSocket(
      peerId,
      {
        type: PeerOutgoingMessageType.CHANGE_ISLAND,
        payload: { islandId, peers: getIslandPeers(islandId) }
      },
      socket ?? sockets[peerId]
    )

    getIslandPeers(islandId).forEach((it) => {
      if (it.id !== peerId) {
        sendMessageToSocket(it.id, {
          type: PeerOutgoingMessageType.PEER_JOINED_ISLAND,
          payload: { islandId, peer: { id: peerId, position } }
        })
      }
    })
  }

  async function connectPeers(
    someSockets: SocketMock[],
    peers: Peer[],
    awaitConnected: boolean = true,
    room: string = 'room'
  ) {
    someSockets.forEach((socket, i) => {
      someSockets
        .filter((dst) => dst !== socket && !socket.destinations.includes(dst))
        .forEach((it) => socket.destinations.push(it))
      sockets[peers[i].peerIdOrFail()] = socket
    })

    await Promise.all(
      peers.map(async (it) => {
        await it.joinRoom(room)
      })
    )

    if (awaitConnected) {
      console.log('Waiting for peers to be connected...')
      await whileTrue(() => peers.some((it) => it.connectedCount() === 0))
    }
  }

  async function createConnectedPeers(peerId1: string, peerId2: string, room: string) {
    const [peer1Socket, peer1] = await createPeer(peerId1)

    await peer1.joinRoom(room)

    const [, peer2] = await createPeer(peerId2, [peer1Socket])

    await peer2.joinRoom(room)

    await peer1.beConnectedTo(peerId2)
    await peer2.beConnectedTo(peerId1)

    return [peer1, peer2]
  }

  async function createConnectedPeersByQty(room: string, qty: number) {
    const sockets: SocketMock[] = []
    const peers: Peer[] = []
    for (let i = 1; i <= qty; i++) {
      const peerId = 'peer' + i

      const socket = createSocket(peerId)

      sockets.push(socket)
      const peer = new Peer(DEFAULT_LIGHTHOUSE, peerId, messageHandler, {
        socketBuilder: () => socket,
        ...extraPeersConfig
      })

      peers.push(peer)
    }

    await connectPeers(sockets, peers, true, room)

    return peers
  }

  async function createPositionedPeers(room: string, awaitConnected: boolean, ...positions: Position3D[]) {
    const someSockets: SocketMock[] = []
    const positionedPeers: PositionedPeer[] = []
    for (let i = 0; i < positions.length; i++) {
      const peerId = 'peer' + i

      const socket = createSocket(peerId)
      someSockets.push(socket)

      const positioned = {
        position: positions[i],
        peer: new Peer(DEFAULT_LIGHTHOUSE, peerId, messageHandler, {
          socketBuilder: () => socket,
          positionConfig: {
            selfPosition: () => positioned.position,
            maxConnectionDistance: 4,
            nearbyPeersDistance: 5,
            disconnectDistance: 5
          },
          ...extraPeersConfig
        })
      }

      putPeerInIsland(peerId, `I${i}`, socket) //TODO: Assign islands using archipelago? Or maybe pass islands through parameter?

      positionedPeers.push(positioned)
    }

    await connectPeers(
      someSockets,
      positionedPeers.map((it) => it.peer),
      awaitConnected
    )

    return positionedPeers
  }

  function setPeerConnectionEstablished(peer: Peer) {
    // @ts-ignore
    peer.wrtcHandler.peerJsConnection._open = true
    // @ts-ignore
    peer.wrtcHandler.peerJsConnection._valid = true
    // @ts-ignore
    peer.wrtcHandler.peerJsConnection._disconnected = false
  }

  function setPeerConnectionRejected(peer: Peer) {
    // @ts-ignore
    peer.wrtcHandler.peerJsConnection._open = false
    // @ts-ignore
    peer.wrtcHandler.peerJsConnection._valid = false
    // @ts-ignore
    peer.wrtcHandler.peerJsConnection._disconnected = true
  }

  function expectPeerInRoom(peer: Peer, roomId: string, lighthouse: string = DEFAULT_LIGHTHOUSE) {
    expect(peer.currentRooms.has(roomId)).toBeTrue()
  }

  beforeEach(() => {
    lighthouses = {}
    sockets = {}
    extraPeersConfig = {}
    // peerPositions = {};
    TimeKeeper.now = () => Date.now()
  })

  it('Timeouts awaiting a non-existing connection', async () => {
    const [, peer1] = await createPeer('peer1')
    try {
      await peer1.beConnectedTo('notAPeer', 200)
      fail('Should timeout')
    } catch (e) {
      expect(e.message).toBe('[peer1] Awaiting connection to peer notAPeer timed out after 200ms')
    }
  })

  it('Performs handshake as expected', async () => {
    const [peer1, peer2] = await createConnectedPeers('peer1', 'peer2', 'room')

    expectConnection(peer1, peer2)
    expectConnection(peer2, peer1)
  })

  it('joining room twice should be idempotent', async () => {
    const [peer1, peer2] = await createConnectedPeers('peer1', 'peer2', 'room')

    expectConnection(peer1, peer2)
    expectConnection(peer2, peer1)

    await peer1.joinRoom('room')

    expectConnection(peer1, peer2)
    expectConnection(peer2, peer1)

    expectPeerToHaveNConnections(1, peer1)
  })

  it('Sends and receives data', async () => {
    const [peer1, peer2] = await createConnectedPeers('peer1', 'peer2', 'room')

    const received = await sendMessage(peer2, peer1, 'room', { hello: 'world' })

    expect(received).toEqual({
      sender: 'peer2',
      room: 'room',
      payload: { hello: 'world' }
    })
  })

  it('Joins a lone room', async () => {
    const [, peer] = await createPeer('peer')

    await peer.joinRoom('room')

    expectPeerInRoom(peer, 'room')
    expectPeerToHaveNoConnections(peer)
  })

  it('Awaits connection when connection is already established', async () => {
    const [, peer] = await createPeer('peer')

    setPeerConnectionEstablished(peer)

    await peer.awaitConnectionEstablished()
  })

  it('Awaits connection when connection is already disconnected', async () => {
    const [, peer] = await createPeer('peer')

    setPeerConnectionRejected(peer)

    return peer
      .awaitConnectionEstablished()
      .then(() => new Error('Promise should not be resolved'))
      .catch((e) => {})
  })

  it('Does not see peers in other rooms', async () => {
    const [, peer1] = await createPeer('peer1')

    await peer1.joinRoom('room1')

    const [, peer2] = await createPeer('peer2')

    await peer2.joinRoom('room2')

    expectPeerInRoom(peer1, 'room1')
    expectPeerInRoom(peer2, 'room2')
  })

  it('does not receive message in other room', async () => {
    const [, peer3] = await createPeer('peer3')

    await peer3.joinRoom('room3')

    const [peer1, peer2] = await createConnectedPeers('peer1', 'peer2', 'room')

    const message1 = future()
    peer1.callback = (sender, room, payload) => {
      message1.resolve({ sender, room, payload })
    }

    const message3 = future()
    peer3.callback = (sender, room, payload) => {
      message3.reject(new Error('peer3 should not receive messages'))
    }
    setTimeout(() => message3.resolve(undefined), 200)

    await peer2.sendMessage('room', { hello: 'world' }, PeerMessageTypes.reliable('reliable'))

    const received = await message1

    expect(received).toEqual({
      sender: 'peer2',
      room: 'room',
      payload: { hello: 'world' }
    })
    expectPeerInRoom(peer3, 'room3')

    await message3
  })

  it('leaves a room it is in', async () => {
    const [socket, mock] = await createPeer('mock')
    await mock.joinRoom('room')

    const [, peer] = await createPeer('peer', [socket])

    await peer.joinRoom('room')

    expectPeerInRoom(peer, 'room')

    await peer.leaveRoom('room')

    expect(peer.currentRooms.size).toBe(0)
  })

  it('leaves a room idempotently', async () => {
    const [, peer] = await createPeer('peer')

    await peer.joinRoom('room')

    expectPeerInRoom(peer, 'room')

    await peer.leaveRoom('room')

    expect(peer.currentRooms.size).toBe(0)

    await peer.leaveRoom('room')

    expect(peer.currentRooms.size).toBe(0)
  })

  it('leaves a room it is in without leaving the rest', async () => {
    const [, peer] = await createPeer('peer')

    await peer.joinRoom('roomin')

    expectPeerInRoom(peer, 'roomin')

    await peer.leaveRoom('room')

    expectPeerInRoom(peer, 'roomin')
  })

  it('sets its id once logged into the server', async () => {
    const socket = new SocketMock([])

    const peer = new Peer(DEFAULT_LIGHTHOUSE, undefined, messageHandler, {
      socketBuilder: () => socket
    })

    assignId(socket)

    expect(peer.peerIdOrFail()).toBe('assigned')
  })

  it('sorts connection candidates by distance', () => {
    const socket = new SocketMock([])

    const peer = new Peer(DEFAULT_LIGHTHOUSE, undefined, messageHandler, {
      socketBuilder: () => socket,
      positionConfig: {
        selfPosition: () => [0, 0, 0],
        maxConnectionDistance: 4,
        nearbyPeersDistance: 5,
        disconnectDistance: 5
      }
    })

    const knownPeers = [
      { id: '4' },
      { id: '3', position: [200, 0, 0] },
      { id: '1', position: [40, 0, 0] },
      { id: '2', position: [70, 0, 0] }
    ]

    // @ts-ignore
    peer.updateKnownPeers(knownPeers)

    // @ts-ignore
    const sortedPeers = knownPeers.sort(peer.peerSortCriteria())

    expect(sortedPeers.map((it) => it.id)).toEqual(['1', '2', '3', '4'])
  })

  it('creates a new connection when setting lighthouse url', async () => {
    let i = -1
    const sockets = [new SocketMock([]), new SocketMock([])]

    const otherLighthouse = 'http://notimportant2:8888'

    const peer = new Peer(DEFAULT_LIGHTHOUSE, 'peer', messageHandler, {
      socketBuilder: () => {
        i++
        return sockets[i]
      }
    })

    assignId(sockets[0], 'bar')

    await peer.joinRoom('room')

    peer.setLighthouseUrl(otherLighthouse)

    assignId(sockets[1])

    expect(sockets[0].closed).toBe(true)
    expect(sockets[1].closed).toBe(false)

    // We don't rejoin rooms and islands by default when setting lighthouse url
    expect(peer.currentRooms.size).toBe(0)
    expect(peer.getCurrentIslandId()).toBeUndefined()

    expect(peer.peerIdOrFail()).toEqual('assigned')
  })

  it('retries connection when disconnected', async () => {
    const sockets: SocketMock[] = []

    const peer = new Peer(DEFAULT_LIGHTHOUSE, undefined, messageHandler, {
      socketBuilder: () => {
        sockets.push(new SocketMock([]))
        return sockets[sockets.length - 1]
      },
      backoffMs: 10
    })

    assignId(sockets[0], 'bar')

    putPeerInIsland(peer.peerIdOrFail(), 'I1', sockets[0])

    await peer.joinRoom('room')

    // We clear lighthouse state to see if it is reconstructed after reconnection
    lighthouses = {}

    sockets[0].onclose()

    await whileTrue(() => sockets.length === 1)

    assignId(sockets[1], 'foo')
    openConnection(sockets[1])

    await untilTrue(() => peer.currentRooms.has('room'), 'Peer should join room when reconnected')
    expect(peer.getCurrentIslandId()).toEqual('I1')

    expect(sockets.length).toEqual(2)
    expect(peer.peerIdOrFail()).toEqual('foo')
  })

  it('expires peers periodically', async () => {
    const oldExpirationInterval = PEER_CONSTANTS.EXPIRATION_LOOP_INTERVAL

    PEER_CONSTANTS.EXPIRATION_LOOP_INTERVAL = 50

    const [peer1, peer2] = await createConnectedPeers('peer1', 'peer2', 'room')

    await sendMessage(peer2, peer1, 'room', 'hello')

    expect(Object.keys(peer1.knownPeers)).toContain('peer2')

    TimeKeeper.now = () => Date.now() + PEER_CONSTANTS.KNOWN_PEERS_EXPIRE_TIME

    await whileTrue(() => Object.keys(peer1.knownPeers).includes('peer2'))

    PEER_CONSTANTS.EXPIRATION_LOOP_INTERVAL = oldExpirationInterval
  })

  it('adds known peers when changing island', async () => {
    const [socket1, peer1] = await createPeer('peer1')

    const peer2 = new Peer(DEFAULT_LIGHTHOUSE, 'peer2', messageHandler, {
      socketBuilder: () => createSocket('peer2', [socket1])
    })

    putPeerInIsland(peer2.peerIdOrFail(), peer1.getCurrentIslandId()!)

    expect(Object.keys(peer2.knownPeers)).toContain('peer1')

    await untilTrue(
      () => Object.keys(peer1.knownPeers).includes('peer2'),
      'Peer 1 should receive notification and add peer 2 to its known peers'
    )
  })

  xit('connects to close peers when updating network', async () => {
    extraPeersConfig = {
      targetConnections: 2,
      maxConnections: 3,
      heartbeatInterval: 100
    }

    const peers = await createPositionedPeers(
      'room',
      false,
      [0, 0, 0],
      [0, 0, 300],
      [0, 0, 600],
      [0, 0, 900],
      [0, 0, 1200],
      [0, 0, 1500]
    )

    function moveAndPutInIsland(peerIndex: number, position: Position3D, island: string = 'I1') {
      peers[peerIndex].position = position
      putPeerInIsland(peers[peerIndex].peer.peerIdOrFail(), island, undefined, position)
    }

    await untilTrue(() => peers[0].peer.connectedCount() === 0, '###### ###### Awaiting connections 0')
    // Since positions are distributed after the peers are created, we could have a couple of connections

    moveAndPutInIsland(0, [0, 0, 300])

    await untilTrue(
      () =>
        peers[0].peer.connectedCount() > 0 &&
        peers[0].peer.fullyConnectedPeerIds().includes(peers[1].peer.peerIdOrFail()),
      '###### ###### Awaiting connections 1'
    )

    moveAndPutInIsland(2, [0, 0, 350])
    moveAndPutInIsland(3, [0, 0, 350])

    await untilTrue(
      () =>
        peers[0].peer.connectedCount() > 2 &&
        (peers[0].peer.fullyConnectedPeerIds().includes(peers[2].peer.peerIdOrFail()) ||
          peers[0].peer.fullyConnectedPeerIds().includes(peers[3].peer.peerIdOrFail())),
      '###### ###### Awaiting connections 2'
    )

    moveAndPutInIsland(4, [0, 0, 300])
    moveAndPutInIsland(5, [0, 0, 300])

    sendMessageToSocket(peers[0].peer.peerIdOrFail(), {
      type: PeerOutgoingMessageType.PEER_LEFT_ISLAND,
      payload: { islandId: 'I1', peer: { id: peers[1].peer.peerIdOrFail(), position: [0, 0, 0] } }
    })

    await untilTrue(
      () =>
        peers[0].peer.fullyConnectedPeerIds().includes(peers[4].peer.peerIdOrFail()) &&
        peers[0].peer.fullyConnectedPeerIds().includes(peers[5].peer.peerIdOrFail()) &&
        peers[0].peer.connectedCount() === 3,
      '###### ###### Awaiting connections 3'
    )

    expect(peers[0].peer.fullyConnectedPeerIds()).not.toContain(peers[2].peer.peerIdOrFail())
    expect(peers[0].peer.fullyConnectedPeerIds()).not.toContain(peers[3].peer.peerIdOrFail())
  })

  it('disconnects when over connected when updating network', () => {})

  it('removes local room representation when leaving room', () => {})

  it('set peers position when updating known peers if their positions are old', () => {})

  it('performs only one network update at a time', () => {})

  it('selects valid connection candidates for network updates', () => {})

  it('finds the worst connected peer by distance', () => {})

  it('counts packet with statstics when received', () => {})

  it('marks a peer as reachable through when receiving a relayed packet', () => {})

  it('updates peer and room based on the packet', () => {})

  it("doesn't process a package expired or duplicate and requests relay suspension", async () => {
    const [peer1, peer2] = await createConnectedPeers('peer1', 'peer2', 'room')

    const receivedMessages: { sender: string; room: string; payload: any }[] = []

    peer2.callback = (sender, room, payload) => {
      receivedMessages.push({ sender, room, payload })
    }

    const message = 'hello'

    const packet = createPacketForMessage(peer1, message, 'room')

    // We send the same packet twice
    sendPacketThroughPeer(peer1, packet)
    sendPacketThroughPeer(peer1, packet)

    await whileTrue(() => receivedMessages.length === 0)

    // Only one packet should be processed
    expect(receivedMessages.length).toBe(1)
    expect(receivedMessages[0].payload).toEqual(message)
    expect(peer2.stats.tagged.duplicate.totalPackets).toEqual(1)

    // We create a packet but send it later, effectively expiring it
    const expiredPacket = createPacketForMessage(peer1, 'expired', 'room', PeerMessageTypes.unreliable('unreliable'))

    const okPacket = createPacketForMessage(peer1, 'ok', 'room', PeerMessageTypes.unreliable('unreliable'))

    expiredPacket.timestamp = okPacket.timestamp - 100

    sendPacketThroughPeer(peer1, okPacket)
    sendPacketThroughPeer(peer1, expiredPacket)

    await whileTrue(() => receivedMessages.length === 1)

    // Only one of those should be processed
    expect(receivedMessages.length).toBe(2)
    expect(receivedMessages[1].payload).toEqual('ok')
    expect(peer2.stats.tagged.expired.totalPackets).toEqual(1)
  })

  xit('suspends relay when receiving duplicate or expired', async () => {
    extraPeersConfig = {
      relaySuspensionConfig: { relaySuspensionDuration: 5000, relaySuspensionInterval: 0 },
      logLevel: 'DEBUG'
    }
    const [peer1, peer2, peer3, peer4] = await createConnectedPeersByQty('room', 4)

    const receivedMessages: { sender: string; room: string; payload: any }[] = []

    peer2.callback = (sender, room, payload) => {
      receivedMessages.push({ sender, room, payload })
    }

    const expired = createPacketForMessage(peer3, 'ok', 'room')
    const ok = createPacketForMessage(peer3, 'ok', 'room')

    expired.timestamp = ok.timestamp - 100

    const other = createPacketForMessage(peer3, 'other', 'room')

    // We send the other packet twice, from different peers. Peer 2 should receive it duplicate from peer1
    sendPacketThroughPeer(peer3, other)
    await whileTrue(() => receivedMessages.length === 0, 'Awaiting peer2 to receive at least a message')
    sendPacketThroughPeer(peer1, other)

    // We fail only if we timeout
    await untilTrue(
      // @ts-ignore
      () => peer2.isRelayFromConnectionSuspended(peer1.peerIdOrFail(), peer3.peerIdOrFail()),
      'Awaiting for peer2 to have asked peer1 to suspend relays for peer3'
    )
    await untilTrue(
      // @ts-ignore
      () => peer1.isRelayToConnectionSuspended(peer2.peerIdOrFail(), peer3.peerIdOrFail()),
      'Awaiting for peer1 to have received request from peer2 to suspend relays for peer3'
    )

    sendPacketThroughPeer(peer3, ok)
    await whileTrue(() => receivedMessages.length === 1, 'Awaiting peer2 to receive another message from peer3')
    sendPacketThroughPeer(peer4, expired)

    await untilTrue(
      // @ts-ignore
      () => peer2.isRelayFromConnectionSuspended(peer4.peerIdOrFail(), peer3.peerIdOrFail()),
      'Awaiting for peer2 to have asked peer4 to suspend relays for peer3'
    )
    await untilTrue(
      // @ts-ignore
      () => peer4.isRelayToConnectionSuspended(peer2.peerIdOrFail(), peer3.peerIdOrFail()),
      'Awaiting for peer4 to have received a request from peer2 to suspend relays for peer3'
    )
  })

  it('consolidates relay suspension request adding pending suspension', () => {})

  it('ignores relay suspension request if only one link remains', () => {})

  it('sends pending succession requests at its interval', () => {})

  it('sends the corresponding packet for a message', () => {})

  it('sends the corresponding packet to valid peers', () => {})

  it('rejects a connection from a peer of another lighthouse or layer', () => {})

  it('rejects a connection from a peer with another protocol version', () => {})

  it('rejects a connection from a peer when it has too many connections', () => {})

  it('updates known peers and rooms with notifications from lighthouse', () => {})

  it('handles authentication', () => {})

  it('raises an specific error when the requested id is taken', async () => {
    let idTakenErrorReceived = false
    extraPeersConfig = {
      statusHandler: (status) => {
        if (status === 'id-taken') {
          idTakenErrorReceived = true
        }
      }
    }
    const [socket] = await createPeer('peer')

    socket.onmessage({
      data: JSON.stringify({ type: ServerMessageType.IdTaken, payload: { msg: 'ETH Address is taken' } })
    })

    expect(idTakenErrorReceived).toEqual(true)
  })

  function getConnectedPeers(peer: Peer) {
    //@ts-ignore
    return peer.wrtcHandler.connectedPeers
  }

  function expectConnection(peer: Peer, otherPeer: Peer) {
    expectPeerToBeConnectedTo(peer, otherPeer)
  }

  function expectPeerToBeConnectedTo(peer: Peer, otherPeer: Peer) {
    const peerToPeer = getConnectedPeers(peer)[otherPeer.peerIdOrFail()]
    expect(peerToPeer.connection).toBeDefined()
    expect(peerToPeer.connection.writable).toBeTrue()
  }

  function sendPacketThroughPeer(peer1: Peer, packet: Packet) {
    // @ts-ignore
    peer1.sendPacket(packet)
  }

  function createPacketForMessage(
    peer: Peer,
    message: any,
    room: string,
    messageType: PeerMessageType = PeerMessageTypes.reliable('reliable')
  ) {
    // @ts-ignore
    const [encoding, payload] = peer.getEncodedPayload(message)

    // @ts-ignore
    return peer.buildPacketWithData(messageType, {
      messageData: { room, encoding, payload, dst: [] }
    })
  }

  function assignId(socket: SocketMock, id: string = 'assigned') {
    socket.onmessage({ data: JSON.stringify({ type: ServerMessageType.AssignedId, payload: { id } }) })
  }

  function openConnection(socket: SocketMock) {
    socket.onmessage({ data: JSON.stringify({ type: ServerMessageType.Open }) })
    socket.onmessage({ data: JSON.stringify({ type: ServerMessageType.ValidationOk }) })
  }

  function expectPeerToHaveNoConnections(peer: Peer) {
    expectPeerToHaveNConnections(0, peer)
  }

  function expectPeerToHaveNConnections(n: number, peer: Peer) {
    const connected = getConnectedPeers(peer)
    if (Object.keys(connected).length !== n) console.log('WRONG CONNECTED PEERS', Object.keys(connected))
    expect(Object.entries(getConnectedPeers(peer)).length).toBe(n)
  }

  // function expectPeerToHaveConnectionsWith(peer: Peer, ...others: Peer[]) {
  //   const peers = Object.values(getConnectedPeers(peer))

  //   expect(peers.length).toBeGreaterThanOrEqual(others.length)

  //   for (const other of others) {
  //     expect(peers.some(($: any) => $.id === other.peerId)).toBeTrue()
  //   }
  // }

  function delay(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time))
  }

  async function whileTrue(
    condition: () => boolean,
    messageIfFailed: string = 'no message specified',
    timeout: number = 5000
  ) {
    const started = Date.now()
    while (condition()) {
      if (Date.now() - started > timeout) {
        throw new Error('Timed out awaiting condition: ' + messageIfFailed)
      }
      await delay(5)
    }
  }

  async function sendMessage(
    src: Peer,
    dst: Peer,
    room: string,
    message: any,
    messageType: PeerMessageType = PeerMessageTypes.reliable('reliable')
  ) {
    const peer2MessagePromise = new Promise((resolve) => {
      dst.callback = (sender, room, payload) => {
        resolve({ sender, room, payload })
      }
    })

    await src.sendMessage(room, message, messageType)

    return await peer2MessagePromise
  }

  async function untilTrue(
    condition: () => boolean,
    messageIfFailed: string = 'no message specified',
    timeout: number = 5000
  ) {
    await whileTrue(() => !condition(), messageIfFailed, timeout)
  }
})
