import { Peer } from "../../peer/src/Peer";
import { randomBetween } from "decentraland-katalyst-utils/util";
import { PeerMessageTypes } from "../../peer/src/messageTypes";
import { Position3D, Quaternion } from "decentraland-katalyst-utils/Positions";
import { PeerConfig } from "../../peer/src";
import { PositionData, CommsMessage } from "./protobuf/comms";
import { util } from "../../peer/src/peerjs-server-connector/util";

const urlParams = new URLSearchParams(location.search);

const numberOfPeers = parseInt(urlParams.get("numberOfPeers") ?? "2");
const testDuration = parseInt(urlParams.get("testDuration") ?? "180") * 1000;
const lighthouseUrl = urlParams.get("lighthouseUrl") ?? "http://localhost:9000";

type Routine = (elapsed: number, delta: number, peer: SimulatedPeer) => void;

const timeBetweenPositionMessages = 100;

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
  return numbers.reduce((a, b) => a + b, 0) / numbers.length
}

function runLoops(startingPosition: Position3D, speed: number = 5): Routine {
  let timeSinceLastPosition = 0;
  return (elapsed, delta, peer) => {
    timeSinceLastPosition += delta;
    if (timeSinceLastPosition > timeBetweenPositionMessages) {
      timeSinceLastPosition = 0;
      peer.peer.sendMessage("room", createCommsMessage(createPositionData(peer.position, peer.rotation)), PeerMessageTypes.unreliable("position"));
      peer.countSent();
    }
  };
}

type SimulatedPeer = {
  messagesSent: number;
  messagesReceived: number;
  countReceived(): void;
  countSent(): void;
  position: Position3D;
  rotation: Quaternion;
  peer: Peer;
  routine: Routine;
};

const PARCEL_SIZE = 16;

const globalStats = {
  messagesSent: 0,
  messagesReceived: 0,
  sentPerSecond: 0,
  receivedPerSecond: 0,
  testStarted: Date.now()
};

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

async function createPeer() {
  const position = generatePosition();

  const simulatedPeer: SimulatedPeer = {
    messagesSent: 0,
    messagesReceived: 0,
    countReceived() {
      this.messagesReceived += 1;
      globalStats.messagesReceived += 1;
    },
    countSent() {
      this.messagesSent += 1;
      globalStats.messagesSent += 1;
    },
    position: generatePosition(),
    rotation: [0, 0, 0, 0],
    peer: new Peer(
      lighthouseUrl,
      util.generateToken(42), // We use a random string of length 42 to emulate a ethereum address as per bandwidth
      (sender, room, payload) => {
        simulatedPeer.countReceived();
      },
      {
        ...peerConfig,
        positionConfig: {
          selfPosition: () => simulatedPeer.position
        }
      }
    ),
    routine: runLoops(position)
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

  let elapsed = 0;
  let lastTickStamp: number | undefined;

  function testOngoing() {
    return elapsed <= testDuration;
  }

  function tick(timestamp: number) {
    const delta = typeof lastTickStamp !== "undefined" ? timestamp - lastTickStamp : 0;
    elapsed += delta;

    if (testOngoing()) {
      if (delta > 0) {
        peers.forEach(it => it.routine(elapsed, delta, it));
      }
      window.requestAnimationFrame(tick);
    }

    lastTickStamp = timestamp;
  }

  window.requestAnimationFrame(tick);

  function setText(id: string, text: any) {
    document.getElementById(id)!.innerText = text.toString();
  }

  let lastLoggedStats = "";
  function updateStats() {
    globalStats.sentPerSecond = (globalStats.messagesSent * 1000) / elapsed;
    globalStats.receivedPerSecond = (globalStats.messagesReceived * 1000) / elapsed;

    setText("peers", peers.length);
    setText("elapsed", (elapsed / 1000).toFixed(2));
    setText("sent", globalStats.messagesSent);
    setText("received", globalStats.messagesReceived);
    setText("receivedpersecond", globalStats.receivedPerSecond);
    setText("sentpersecond", globalStats.sentPerSecond);
    
    setText("connected-peers", average(peers.map(it => it.peer.fullyConnectedPeerIds().length)))
    // @ts-ignore
    setText("known-peers", average(peers.map(it => Object.keys(it.peer.knownPeers).length)))
    // @ts-ignore
    setText("latency", average(peers.flatMap(it => Object.values(it.peer.knownPeers).map(kp => kp.latency))))

    const statsToLog = JSON.stringify(globalStats, null, 2);

    if (lastLoggedStats !== statsToLog) {
      console.log("Stats: ", statsToLog);
      lastLoggedStats = statsToLog;
    }

    if (testOngoing()) {
      setTimeout(updateStats, 500);
    }
  }

  updateStats();
})().catch(e => {
  console.error("Error while running tests", e);
});
