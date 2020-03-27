import { Peer } from "../../src/Peer";
import { util } from "../../src/peerjs-server-connector/util";
import { delay } from "decentraland-katalyst-utils/util";

const urlParams = new URLSearchParams(location.search);

const numberOfPeers = parseInt(urlParams.get("numberOfPeers") ?? '5');
const messageCount = parseInt(urlParams.get("messagesCount") ?? '200');
const timeBetweenMessages = parseInt(urlParams.get("timeBetweenMessages") ?? '50');
const lighthouseUrl = urlParams.get("lighthouseUrl") ?? "http://localhost:9000";

const sessionId = urlParams.get("sessionId") ?? util.randomToken();

(async () => {
  const globalStats = {
    messagesSent: 0,
    messagesReceived: 0,
    totalLatency: 0,
    averageLatency: 0,
    sentPerSecond: 0,
    receivedPerSecond: 0,
    testStarted: new Date().getTime()
  };

  console.log("Creating " + numberOfPeers + " peers");

  type PeerContainer = {
    messagesSent: number;
    messagesReceived: number;
    countReceived(): void;
    countSent(): void;
    peer?: Peer;
  };

  const peers: PeerContainer[] = [];
  const finishedPeers: PeerContainer[] = [];

  for (let i = 0; i < numberOfPeers; i++) {
    const peerContainer: PeerContainer = {
      messagesSent: 0,
      messagesReceived: 0,
      countReceived() {
        this.messagesReceived += 1;
        globalStats.messagesReceived += 1;
      },
      countSent() {
        this.messagesSent += 1;
        globalStats.messagesSent += 1;
      }
    };

    const peer = new Peer(
      lighthouseUrl,
      `peer_${sessionId}_${i}`,
      (sender, room, payload) => {
        peerContainer.countReceived();
        const { stamp } = payload;
        const latency = new Date().getTime() - stamp;
        globalStats.totalLatency += latency;
        globalStats.averageLatency =
          globalStats.totalLatency / globalStats.messagesReceived;
      }
    );

    peerContainer.peer = peer;

    peers.push(peerContainer);
  }

  await peers[0].peer?.joinRoom("room");

  await Promise.all(peers.map(pc => pc.peer!.joinRoom("room")));

  function doSendMessage(container: PeerContainer) {
    const messageId = util.randomToken();
    container.peer!.sendMessage("room", {
      test: "this is a test",
      messageId,
      stamp: new Date().getTime()
    });
    container.countSent();
  }

  async function startSendingMessages(peerContainer: PeerContainer) {
    const send = () => {
      doSendMessage(peerContainer);
      if (peerContainer.messagesSent < messageCount) {
        setTimeout(send, timeBetweenMessages);
      } else {
        console.log("Peer finished: " + peerContainer.peer!.peerId);
        finishedPeers.push(peerContainer);

        if (finishedPeers.length === peers.length) {
          console.log("All peers finished");
        }
      }
    };

    await delay(Math.floor(Math.random() * timeBetweenMessages));

    send();
  }

  setTimeout(() => {
    peers.forEach(it => {
      startSendingMessages(it);
    });
  }, 2000);

  function setText(id: string, text: any) {
    document.getElementById(id)!.innerText = text.toString();
  }

  let lastLoggedStats = "";
  function updateStats() {
    const currentTime = new Date().getTime();
    const remainingPeers = peers.length - finishedPeers.length;
    setText("peers", peers.length);
    setText("peerssending", remainingPeers);
    setText("sent", globalStats.messagesSent);
    setText("received", globalStats.messagesReceived);
    setText("latency", globalStats.averageLatency);
    if (remainingPeers > 0) {
      const runtime = currentTime - globalStats.testStarted;
      globalStats.sentPerSecond = (globalStats.messagesSent * 1000) / runtime;
      globalStats.receivedPerSecond =
        (globalStats.messagesReceived * 1000) / runtime;

      setText("sentpersecond", globalStats.sentPerSecond);
      setText("receivedpersecond", globalStats.receivedPerSecond);
    }

    const statsToLog = JSON.stringify(globalStats, null, 2);

    if (lastLoggedStats !== statsToLog) {
      console.log("Stats: ", statsToLog);
      lastLoggedStats = statsToLog;
    }

    setTimeout(updateStats, 500);
  }

  updateStats();
})().catch(e => {
  console.error("Error while running tests", e);
});
