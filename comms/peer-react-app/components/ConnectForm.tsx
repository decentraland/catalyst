import React, { useState } from "react";
import { Field, Button } from "decentraland-ui";

import { IPeer } from "../../peer/src/types";
import { PeerToken } from "./PeerToken";
import { Peer } from "../../peer/src";

function fieldFor(label: string, value: string, setter: (s: string) => any) {
  return <Field label={label} onChange={ev => setter(ev.target.value)} value={value} />;
}

export const layer = "blue";

declare const window: Window & { peer: Peer };

export function ConnectForm(props: {
  onConnected: (peer: IPeer, layer: string, room: string, url: string) => any;
  peerClass: {
    new (url: string, nickname: string, callback: any, config: any): IPeer;
  };
}) {
  const [url, setUrl] = useState("http://localhost:9000");
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState("");
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function joinRoom() {
    setError("");
    setLoading(true);
    try {
      //@ts-ignore
      const peer = (window.peer = new props.peerClass(url, nickname, () => {}, {
        token: PeerToken.getToken(nickname),
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
            }
          ]
        }
      }));
      await peer.setLayer(layer);
      await peer.joinRoom(room);
      setLoading(false);
      props.onConnected(peer, layer, room, url);
    } catch (e) {
      setError(e.message ?? e.toString());
      setLoading(false);
    }
  }

  return (
    <div className="connect-form">
      {fieldFor("URL", url, setUrl)}
      {fieldFor("Nickname", nickname, setNickname)}
      {fieldFor("Room", room, setRoom)}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <Button primary disabled={[url, nickname, room].some(it => it === "") || isLoading} onClick={joinRoom} loading={isLoading}>
        Connect
      </Button>
    </div>
  );
}
