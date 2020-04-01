import { Peer } from "../../peer/src/Peer";
import { randomBetween } from "decentraland-katalyst-utils/util";
import { PeerMessageTypes } from "../../peer/src/messageTypes";
import { Position3D, Quaternion } from "decentraland-katalyst-utils/Positions";
import { PeerConfig } from "../../peer/src";
import { PositionData, CommsMessage } from "./protobuf/comms";
import { util } from "../../peer/src/peerjs-server-connector/util";
import { GlobalStats } from "../../peer/src/stats";
import { Reader } from "protobufjs";

const urlParams = new URLSearchParams(location.search);

const numberOfPeers = parseInt(urlParams.get("numberOfPeers") ?? "1");
const testDuration = parseInt(urlParams.get("testDuration") ?? "180") * 1000;
const statsSubmitInterval = parseInt(urlParams.get("statsSubmitInterval") ?? "2000");
const lighthouseUrl = urlParams.get("lighthouseUrl") ?? "http://localhost:9000";
const statsServerUrl = urlParams.get("statsServerUrl") ?? "http://localhost:9904";
const testId = urlParams.get("testId");

if (!testId) {
  console.error("Missing parameter testId! No results will be submited to stats server");
}

type Routine = (elapsed: number, delta: number, peer: SimulatedPeer) => void;

const timeBetweenPositionMessages = 100;

let elapsed = 0;

function testOngoing() {
  return elapsed <= testDuration;
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
  });
  return positionData;
}

function createCommsMessage(data: PositionData) {
  const commsMessage = CommsMessage.fromPartial({
    time: Date.now(),
    positionData: data
  });

  return commsMessage;
}

function average(numbers: number[]) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function runLoops(startingPosition: Position3D, speed: number = 5): Routine {
  let timeSinceLastPosition = 0;
  return (elapsed, delta, peer) => {
    timeSinceLastPosition += delta;
    if (timeSinceLastPosition > timeBetweenPositionMessages) {
      timeSinceLastPosition = 0;
      peer.peer.sendMessage("room", createCommsMessage(createPositionData(peer.position, peer.rotation)), PeerMessageTypes.unreliable("position"));
    }
  };
}

type SimulatedPeer = {
  position: Position3D;
  rotation: Quaternion;
  peer: Peer;
  routine: Routine;
};

const PARCEL_SIZE = 16;

const peerConfig: PeerConfig = {
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
      },
      {
        urls: "turn:stun.decentraland.org:3478",
        credential: "passworddcl",
        username: "usernamedcl"
      }
    ]
  },
  pingInterval: 3000,
  authHandler: msg => Promise.resolve(msg),
  logLevel: "NONE"
};

function generatePosition(): Position3D {
  // For now the positions are generated randomly in a 4 by 4 parcel range
  const randomComponent = () => randomBetween(-2 * PARCEL_SIZE, 2 * PARCEL_SIZE);
  return [randomComponent(), 0, randomComponent()];
}

async function submitStats(peer: SimulatedPeer, stats: GlobalStats) {
  function buildStatsFor(statsKey: string) {
    const result: Record<string, any> = {};

    result[statsKey] = stats[statsKey].packets;
    result[`${statsKey}PerSecond`] = stats[statsKey].packetsPerSecond;
    result[`${statsKey}Bytes`] = stats[statsKey].totalBytes;
    result[`${statsKey}BytesPerSecond`] = stats[statsKey].bytesPerSecond;
    result[`${statsKey}AveragePacketSize`] = stats[statsKey].averagePacketSize;

    return result;
  }

  const latencies = Object.values(peer.peer.knownPeers)
    .map(kp => kp.latency!)
    .filter(it => typeof it !== "undefined");

  const statsToSubmit = {
    ...buildStatsFor("sent"),
    ...buildStatsFor("received"),
    ...buildStatsFor("relayed"),
    ...buildStatsFor("all"),
    duplicates: stats.received.packetDuplicates,
    duplicatesPerSecond: stats.received.duplicatesPerSecond,
    duplicatesPercentage: stats.received.duplicatePercentage
  };

  if (latencies.length > 0) {
    statsToSubmit["averageLatency"] = average(latencies);
  }

  if (statsServerUrl && testId) {
    await fetch(`${statsServerUrl}/test/${testId}/peer/${peer.peer.peerId}/metrics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(statsToSubmit)
    });
  }
}

async function createPeer() {
  const position = generatePosition();

  const simulatedPeer: SimulatedPeer = {
    position: generatePosition(),
    rotation: [0, 0, 0, 0],
    peer: new Peer(
      lighthouseUrl,
      util.generateToken(42), // We use a random string of length 42 to emulate a ethereum address as per bandwidth
      (sender, room, payload: Uint8Array) => {
        const message = CommsMessage.decode(Reader.create(payload));

        if (message.positionData) {
          simulatedPeer.peer.setPeerPosition(sender, [message.positionData.positionX, message.positionData.positionY, message.positionData.positionZ]);
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
  };

  simulatedPeer.peer.stats.onPeriodicStatsUpdated = stats => {
    if (testOngoing()) submitStats(simulatedPeer, stats).catch(e => console.error("Error submiting stats to server", e));
  };

  await simulatedPeer.peer.awaitConnectionEstablished();
  await simulatedPeer.peer.setLayer("blue");
  // TODO: Join multiple rooms?
  await simulatedPeer.peer.joinRoom("room");

  return simulatedPeer;
}

(async () => {
  console.log("Creating " + numberOfPeers + " peers");

  const peers: SimulatedPeer[] = await Promise.all([...new Array(numberOfPeers).keys()].map(_ => createPeer()));

  // function doSendMessage(container: SimulatedPeer) {
  //   const messageId = util.randomToken();
  //   container.peer!.sendMessage(
  //     "room",
  //     {
  //       test: "this is a test",
  //       messageId,
  //       stamp: new Date().getTime()
  //     },
  //     PeerMessageTypes.unreliable("test")
  //   );
  //   container.countSent();
  // }

  let lastTickStamp: number | undefined;

  function tick() {
    const timestamp = performance.now();
    const delta = typeof lastTickStamp !== "undefined" ? timestamp - lastTickStamp : 0;
    elapsed += delta;

    lastTickStamp = timestamp;

    if (testOngoing()) {
      if (delta > 0) {
        peers.forEach(it => it.routine(elapsed, delta, it));
      }
      setTimeout(tick, 16);
    } else {
      // TODO: Submit summary to server
      console.log("Test finished");
    }
  }

  setTimeout(tick, 16);

  function setText(id: string, text: any) {
    document.getElementById(id)!.innerText = text.toString();
  }

  function sumForAllPeers(statsKey: string, valueKey: string) {
    return peers.reduce((value, peer) => value + peer.peer.stats[statsKey][valueKey], 0);
  }

  function avgForAllPeers(statsKey: string, valueKey: string) {
    return sumForAllPeers(statsKey, valueKey) / peers.length;
  }

  function updateStats() {
    setText("peers", peers.length);
    setText("elapsed", (elapsed / 1000).toFixed(2));
    setText("sent", sumForAllPeers("sent", "packets"));
    setText("received", sumForAllPeers("received", "packets"));
    setText("relayed", sumForAllPeers("relayed", "packets"));
    setText("receivedpersecond", avgForAllPeers("received", "packetsPerSecond"));
    setText("sentpersecond", avgForAllPeers("sent", "packetsPerSecond"));
    setText("relayedpersecond", sumForAllPeers("relayed", "packetsPerSecond"));

    setText("connected-peers", average(peers.map(it => it.peer.fullyConnectedPeerIds().length)));
    // @ts-ignore
    setText("known-peers", average(peers.map(it => Object.keys(it.peer.knownPeers).length)));
    // @ts-ignore
    setText("latency", average(peers.flatMap(it => Object.values(it.peer.knownPeers).map(kp => kp.latency))));

    if (testOngoing()) {
      setTimeout(updateStats, 500);
    }
  }

  updateStats();
})().catch(e => {
  console.error("Error while running tests", e);
});
