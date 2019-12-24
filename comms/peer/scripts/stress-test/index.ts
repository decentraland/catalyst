import { Peer } from "../../src/Peer";
import { util } from "../../src/peerjs-server-connector/util";

function sleep(time: number) {
  return new Promise<null>(resolve => {
    setTimeout(resolve, time);
  });
}

const sessionId = util.randomToken();

(async () => {
  const numberOfPeers = 5;
  const messageCount = 200;
  const timeBetweenMessages = 50;

  const globalStats = {
    messagesSent: 0,
    messagesReceived: 0,
    totalLatency: 0,
    averageLatency: 0,
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
      "http://localhost:9000",
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
        console.log("Peer finished: " + peerContainer.peer!.nickname);
        finishedPeers.push(peerContainer);
      }
    };

    await sleep(Math.floor(Math.random() * timeBetweenMessages));

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
      setText("sentpersecond", (globalStats.messagesSent * 1000) / runtime);
      setText(
        "receivedpersecond",
        (globalStats.messagesReceived * 1000) / runtime
      );
    }

    setTimeout(updateStats, 500);
  }

  updateStats();
})();
