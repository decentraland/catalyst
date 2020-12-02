import { Peer } from '../../peer/src/Peer'
import { randomBetween } from 'decentraland-katalyst-utils/util'
import { PeerMessageTypes } from '../../peer/src/messageTypes'
import { Position3D, Quaternion } from 'decentraland-katalyst-utils/Positions'
import { PeerConfig } from '../../peer/src'
import { PositionData, CommsMessage, ProfileData, ChatData } from './protobuf/comms'
import { util } from '../../peer/src/peerjs-server-connector/util'
import { GlobalStats, buildCatalystPeerStatsData } from '../../peer/src/stats'
import { Reader } from 'protobufjs'

const urlParams = new URLSearchParams(location.search)

const numberOfPeers = parseInt(urlParams.get('numberOfPeers') ?? '1')
const testDuration = parseInt(urlParams.get('testDuration') ?? '180') * 1000
const statsSubmitInterval = parseInt(urlParams.get('statsSubmitInterval') ?? '2000')
const lighthouseUrl = urlParams.get('lighthouseUrl') ?? 'http://localhost:9000'
const statsServerUrl = urlParams.get('statsServerUrl') ?? 'http://localhost:9904'
const testId = urlParams.get('testId')
const pingInterval = parseInt(urlParams.get('pingInterval') ?? '9')

const peerIdLength = parseInt(urlParams.get('peerIdLength') ?? '42') // We use a string of length 42 to emulate a ethereum address as per bandwidth

if (!testId) {
  console.error('Missing parameter testId! No results will be submited to stats server')
}

type Routine = (elapsed: number, delta: number, peer: SimulatedPeer) => void

const timeBetweenPositionMessages = 100
const timeBetweenProfileMessages = 1000
const timeBetweenChatMessages = 10000

let elapsed = 0

function testOngoing() {
  return elapsed <= testDuration
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    let r = (Math.random() * 16) | 0
    let v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function createPositionData(p: Position3D, q: Quaternion) {
  const positionData = PositionData.fromPartial({
    positionX: p[0],
    positionY: p[1],
    positionZ: p[2],
    rotationX: q[0],
    rotationY: q[1],
    rotationZ: q[2],
    rotationW: q[3]
  })
  return positionData
}

function createProfileData(peerId: string) {
  const positionData = ProfileData.fromPartial({
    userId: peerId,
    profileVersion: '1'
  })
  return positionData
}

function createChatData(peerId: string) {
  const chatData = ChatData.fromPartial({
    messageId: uuid(),
    text: util.generateToken(40)
  })
  return chatData
}

function createAndEncodeCommsMessage(data: PositionData | ProfileData | ChatData, dataKey: keyof CommsMessage) {
  const commsMessage = CommsMessage.fromPartial({
    time: Date.now(),
    [dataKey]: data
  })

  return CommsMessage.encode(commsMessage).finish()
}

function average(numbers: number[]) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length
}

class PeriodicAction {
  private elapsed: number = 0
  constructor(private period: number, private action: (elapsed, delta, peer) => void) {}

  update(elapsed: number, delta: number, peer: SimulatedPeer) {
    this.elapsed += delta
    if (this.elapsed > this.period) {
      this.elapsed = 0
      this.action(elapsed, delta, peer)
    }
  }
}

function runLoops(startingPosition: Position3D, speed: number = 5): Routine {
  let periodicPosition = new PeriodicAction(timeBetweenPositionMessages, (a, b, peer) => {
    peer.peer.sendMessage(
      'room',
      createAndEncodeCommsMessage(createPositionData(peer.position, peer.rotation), 'positionData'),
      PeerMessageTypes.unreliable('position')
    )
  })

  let periodicProfile = new PeriodicAction(timeBetweenProfileMessages, (a, b, peer) => {
    peer.peer.sendMessage(
      'room',
      createAndEncodeCommsMessage(createProfileData(peer.peer.peerId), 'profileData'),
      PeerMessageTypes.unreliable('profile')
    )
  })

  let periodicChat = new PeriodicAction(timeBetweenChatMessages, (a, b, peer) => {
    peer.peer.sendMessage(
      'room',
      createAndEncodeCommsMessage(createChatData(peer), 'chatData'),
      PeerMessageTypes.reliable('chat')
    )
  })

  return (elapsed, delta, peer) => {
    //TODO: Move the peer
    periodicPosition.update(elapsed, delta, peer)
    periodicProfile.update(elapsed, delta, peer)
    periodicChat.update(elapsed, delta, peer)
  }
}

function testStarted() {
  let started = false
  let timedout = false
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!started) {
        timedout = true
        reject('Timed out waiting for test to start')
      }
    }, 600 * 1000)

    const checkTestStarted = async () => {
      try {
        const testStartedResponse = await fetch(`${statsServerUrl}/test/${testId}`)
        if (testStartedResponse.status === 200) {
          const responseJson = await testStartedResponse.json()
          if (responseJson.started) {
            started = true
            resolve()
          }
        }
      } catch (e) {
        console.warn('Error checking if test started', e)
      }

      if (!started && !timedout) {
        console.log('Awaiting for test to be started...')
        setTimeout(checkTestStarted, 3000)
      }
    }

    checkTestStarted()
  })
}

type SimulatedPeer = {
  position: Position3D
  rotation: Quaternion
  peer: Peer
  routine: Routine
}

const PARCEL_SIZE = 16

const peerConfig: PeerConfig = {
  connectionConfig: {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      },
      {
        urls: 'stun:stun2.l.google.com:19302'
      },
      {
        urls: 'stun:stun3.l.google.com:19302'
      },
      {
        urls: 'stun:stun4.l.google.com:19302'
      },
      {
        urls: 'turn:stun.decentraland.org:3478',
        credential: 'passworddcl',
        username: 'usernamedcl'
      }
    ]
  },
  pingInterval,
  authHandler: (msg) => Promise.resolve(msg),
  logLevel: 'NONE'
}

function generatePosition(): Position3D {
  // For now the positions are generated randomly in a 4 by 4 parcel range
  const randomComponent = () => randomBetween(-2 * PARCEL_SIZE, 2 * PARCEL_SIZE)
  return [randomComponent(), 0, randomComponent()]
}

async function submitStats(peer: SimulatedPeer, stats: GlobalStats) {
  const statsToSubmit = buildCatalystPeerStatsData(peer.peer)

  if (statsServerUrl && testId) {
    await fetch(`${statsServerUrl}/test/${testId}/peer/${peer.peer.peerId}/metrics`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statsToSubmit)
    })
  }
}

async function retry(promiseCreator: () => Promise<any>, retries: number = 5, attempts: number = 0) {
  try {
    await promiseCreator()
  } catch (e) {
    if (attempts < retries) {
      await retry(promiseCreator, retries, attempts + 1)
    } else {
      throw e
    }
  }
}

async function createPeer() {
  const position = generatePosition()

  const simulatedPeer: SimulatedPeer = {
    position: generatePosition(),
    rotation: [0, 0, 0, 0],
    peer: new Peer(
      lighthouseUrl,
      util.generateToken(peerIdLength),
      (sender, room, payload: Uint8Array) => {
        const message = CommsMessage.decode(Reader.create(payload))

        if (message.positionData) {
          simulatedPeer.peer.setPeerPosition(sender, [
            message.positionData.positionX,
            message.positionData.positionY,
            message.positionData.positionZ
          ])
        }
      },
      {
        ...peerConfig,
        statsUpdateInterval: statsSubmitInterval,
        positionConfig: {
          selfPosition: () => simulatedPeer.position
        }
      }
    ),
    routine: runLoops(position)
  }

  await simulatedPeer.peer.awaitConnectionEstablished()

  await retry(() => simulatedPeer.peer.setLayer('blue'))
  await retry(() => simulatedPeer.peer.joinRoom('room'))

  simulatedPeer.peer.stats.onPeriodicStatsUpdated = (stats) => {
    if (testOngoing())
      submitStats(simulatedPeer, stats).catch((e) => console.error('Error submiting stats to server', e))
  }

  return simulatedPeer
}

;(async () => {
  if (testId) await testStarted()

  console.log('Creating ' + numberOfPeers + ' peers')

  const peers: SimulatedPeer[] = await Promise.all([...new Array(numberOfPeers).keys()].map((_) => createPeer()))

  let lastTickStamp: number | undefined

  function tick() {
    const timestamp = performance.now()
    const delta = typeof lastTickStamp !== 'undefined' ? timestamp - lastTickStamp : 0

    elapsed += delta

    lastTickStamp = timestamp

    if (testOngoing()) {
      if (delta > 0) {
        peers.forEach((it) => it.routine(elapsed, delta, it))
      }
      setTimeout(tick, 16)
    } else {
      // TODO: Submit summary to server
      console.log('Test finished')
    }
  }

  // We delay the first tick a random number to ensure the clients are not in sync
  setTimeout(tick, Math.floor(Math.random() * 3000))

  function setText(id: string, text: any) {
    document.getElementById(id)!.innerText = text.toString()
  }

  function sumForAllPeers(statsKey: string, valueKey: string) {
    return peers.reduce((value, peer) => value + peer.peer.stats[statsKey][valueKey], 0)
  }

  function avgForAllPeers(statsKey: string, valueKey: string) {
    return sumForAllPeers(statsKey, valueKey) / peers.length
  }

  function updateStats() {
    setText('peers', peers.length)
    setText('elapsed', (elapsed / 1000).toFixed(2))
    setText('sent', sumForAllPeers('sent', 'totalPackets'))
    setText('received', sumForAllPeers('received', 'totalPackets'))
    setText('relayed', sumForAllPeers('relayed', 'totalPackets'))
    setText('receivedpersecond', avgForAllPeers('received', 'packetsPerSecond'))
    setText('sentpersecond', avgForAllPeers('sent', 'packetsPerSecond'))
    setText('relayedpersecond', sumForAllPeers('relayed', 'packetsPerSecond'))

    setText('connected-peers', average(peers.map((it) => it.peer.fullyConnectedPeerIds().length)))
    // @ts-ignore
    setText('known-peers', average(peers.map((it) => Object.keys(it.peer.knownPeers).length)))
    // @ts-ignore
    setText('latency', average(peers.flatMap((it) => Object.values(it.peer.knownPeers).map((kp) => kp.latency))))

    if (testOngoing()) {
      setTimeout(updateStats, 500)
    }
  }

  updateStats()
})().catch((e) => {
  console.error('Test aborted', e)
})
