import { Peer, PeerConnectionData } from "../src/Peer";
import * as PeerConnectionModule from "../src/peerjs-server-connector/peerjsserverconnection";
import { MockManager, ImportMock } from "ts-mock-imports";
import { delay } from "../src/peerjs-server-connector/util";

const oldFetch = fetch;
const globalScope: any = typeof window === "undefined" ? global : window;

describe("Peer Integration Test", function() {
  let connectionMock: MockManager<PeerConnectionModule.PeerJSServerConnection>;
  const peerIds: PeerConnectionData[] = [];

  beforeEach(() => {
    globalScope.fetch = (input, init) =>
      Promise.resolve(new Response(JSON.stringify(peerIds)));

    connectionMock = ImportMock.mockClass(
      PeerConnectionModule,
      "PeerJSServerConnection"
    );

    // connectionMock.getMockInstance().sendOffer = (userId: String, offer) =>
  });

  afterEach(() => {
    connectionMock.restore();
    globalScope.fetch = oldFetch;
  });

  it(`Performs handshake as expected`, async () => {
    const peer1 = new Peer(
      "http://notimportant:8888/",
      "peer1",
      (sender, room, payload) => {
        console.log(`Received message from ${sender} in ${room}`, payload);
      }
    );

    await peer1.joinRoom("room");

    peerIds.push({ userId: "peer1", peerId: "peer1" });

    const peer2 = new Peer(
      "http://notimportant:8888/",
      "peer2",
      (sender, room, payload) => {
        console.log(`Received message from ${sender} in ${room}`, payload);
      }
    );

    connectionMock.set(
      "sendOffer",
      (userId: string, offerData: any, connectionId: string) => {
        peer1.handleMessage(
          PeerConnectionModule.createOfferMessage(
            "peer2",
            userId,
            offerData,
            connectionId
          )
        );
      }
    );

    connectionMock.set(
      "sendAnswer",
      (userId: string, answerData: any, connectionId: string) => {
        peer2.handleMessage(
          PeerConnectionModule.createAnswerMessage(
            "peer1",
            userId,
            answerData,
            connectionId
          )
        );
      }
    );

    connectionMock.set(
      "sendCandidate",
      (userId: string, candidateData: any, connectionId: string) => {
        peer2.handleMessage(
          PeerConnectionModule.createCandidateMessage(
            "peer1",
            userId,
            candidateData,
            connectionId
          )
        );
      }
    );

    await peer2.joinRoom("room");

    await delay(2000);

    const peer1Room = peer1.currentRooms[0];
    expect(peer1Room.id).toBe("room");
    expect(peer1Room.users.size).toBe(2);
    expect(peer1Room.users.has("peer2:peer2")).toBeTrue();
    //@ts-ignore
    // const peer12peer2
    // expect(peer1.peers["peer2"].reliableConnection).toBeDefined()
  });
});
