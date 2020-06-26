import React, { useState, useEffect } from "react";
import { Field, Button } from "decentraland-ui";

import { IPeer } from "../../peer/src/types";
import { PeerToken } from "./PeerToken";
import { Peer } from "../../peer/src";
import { util } from "../../peer/src/peerjs-server-connector/util";
import { mouse } from "./Mouse";
import { discretizedPositionDistance } from "../../../commons/utils/Positions";

function fieldFor(label: string, value: string, setter: (s: string) => any) {
  return <Field label={label} onChange={(ev) => setter(ev.target.value)} value={value} />;
}

export const layer = "blue";

declare const window: Window & { peer: Peer };

export function ConnectForm(props: {
  onConnected: (peer: IPeer, layer: string, room: string, url: string) => any;
  peerClass: {
    new (url: string, peerId: string, callback: any, config: any): IPeer;
  };
}) {
  const [url, setUrl] = useState("http://localhost:9000");
  let [nickname, setNickname] = useState("");
  let [room, setRoom] = useState("");
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);

  const queryRoom = searchParams.get("room");
  const queryNickname = searchParams.get("nickname");

  async function joinRoom() {
    setError("");
    setLoading(true);
    try {
      //@ts-ignore
      const peer = (window.peer = new props.peerClass(url, undefined, () => {}, {
        token: PeerToken.getToken(nickname),
        positionConfig: {
          selfPosition: () => [mouse.x, mouse.y, 0],
          maxConnectionDistance: 3,
          distance: discretizedPositionDistance([100, 200, 400, 600, 800]),
          nearbyPeersDistance: 10,
          disconnectDistance: 5
        },
        targetConnections: 2,
        logLevel: "DEBUG",
        maxConnections: 6,
        pingTimeout: 5000,
        pingInterval: 2000,
        optimizeNetworkInterval: 5000,
        connectionConfig: {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
            {
              urls: "stun:stun2.l.google.com:19302",
            },
            {
              urls: "stun:stun3.l.google.com:19302",
            },
            {
              urls: "stun:stun4.l.google.com:19302",
            },
          ],
        },
        authHandler: (msg) => Promise.resolve(msg),
      }));
      await peer.awaitConnectionEstablished();
      await peer.setLayer(layer);
      await peer.joinRoom(room);
      setLoading(false);
      props.onConnected(peer, layer, room, url);
    } catch (e) {
      setError(e.message ?? e.toString());
      setLoading(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("join")) {
      room = queryRoom ?? "room";
      nickname = queryNickname ?? "peer-" + util.randomToken();

      joinRoom();
    }
  }, []);

  return (
    <div className="connect-form">
      {fieldFor("URL", url, setUrl)}
      {fieldFor("Nickname", nickname, setNickname)}
      {fieldFor("Room", room, setRoom)}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <Button primary disabled={[url, nickname, room].some((it) => it === "") || isLoading} onClick={joinRoom} loading={isLoading}>
        Connect
      </Button>
    </div>
  );
}
