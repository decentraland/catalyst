import { Peer } from "../../src/Peer";

function sleep(time: number) {
  return new Promise<null>(resolve => {
    setTimeout(resolve, time)
  })
}

(async () => {
  const numberOfPeers = 5;
  const messageCount = 500;
  const timeBetweenMessages = 50; 
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
    countMessage(msgDetails: any): void;
    peer: Peer;
  };

  const peers: PeerContainer[] = [];

  for (let i = 0; i < numberOfPeers; i++) {
    const peerContainer: PeerContainer = {
      messagesSent: 0,
      messagesReceived: 0,
      countMessage(msgDetails) {
        this.messagesReceived += 1;
        globalStats.messagesReceived += 1;
      },
      peer: undefined as Peer
    };

    const peer = new Peer(
      "http://localhost:9000/",
      "peer" + i,
      (sender, room, payload) => {
        peerContainer.countMessage({ sender, room, payload });
      }
    );

    peerContainer.peer = peer;

    peers.push(peerContainer);
  }

  await Promise.all(peers.map(pc => pc.peer.joinRoom("room")));

  function startSendingMessages(peerContainer: PeerContainer) {
    await()
    const doSendMessage = () => {

      peerContainer.peer.sendMessage("room", { test: "this is a test" });
    };
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
})();
