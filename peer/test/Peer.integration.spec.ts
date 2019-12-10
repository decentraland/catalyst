import { Peer, PeerConnectionData } from "../src/Peer";
import * as PeerConnectionModule from "../src/peerjs-server-connector/peerjsserverconnection";
import { MockManager, ImportMock } from "ts-mock-imports";
import fetchMock from "fetch-mock";
import { ServerMessageType } from "../src/peerjs-server-connector/enums";

describe("Peer Integration Test", function() {
  let connectionMock: MockManager<PeerConnectionModule.PeerJSServerConnection>;

  const peerIds: PeerConnectionData[] = [];

  beforeEach(() => {
    fetchMock.put("path:/rooms/room", peerIds);

    connectionMock = ImportMock.mockClass(
      PeerConnectionModule,
      "PeerJSServerConnection"
    );

    // connectionMock.getMockInstance().sendOffer = (userId: String, offer) =>
  });

  afterEach(() => {
    connectionMock.restore();
    fetchMock.restore();
  });

  it(`Performs handshake as expected`, () => {
    const peer1 = new Peer("http://notimportant:8888/", 'peer1', (sender, room, payload) => {
      console.log(`Received message from ${sender} in ${room}`, payload)
    })

    peer1.joinRoom('room')

    peerIds.push({userId: 'peer1', peerId: 'peer1'});

    const peer2 = new Peer("http://notimportant:8888/", 'peer2', (sender, room, payload) => {
      console.log(`Received message from ${sender} in ${room}`, payload)
    })

    connectionMock.getMockInstance().sendOffer = (userId: string, offerData: string, connectionId: string) => {
      peer1.handleMessage({payload: offerData, src: "peer1", type: ServerMessageType.Offer})
    }

    connectionMock.getMockInstance().sendAnswer = (userId: string, answerData: string, connectionId: string) => {
      peer2.handleMessage({payload: answerData, src: "peer2", type: ServerMessageType.Answer})
    }

    peer2.joinRoom('room')
  });
});
