import React, { useState } from "react";
import { Field, Button } from "decentraland-ui";

import { IPeer } from "../../peer/Peer";

function fieldFor(label: string, value: string, setter: (s: string) => any) {
  return (
    <Field
      label={label}
      onChange={ev => setter(ev.target.value)}
      value={value}
    />
  );
}

export function ConnectForm(props: {
  onConnected: (peer: IPeer, room: string) => any;
  peerClass: { new (url: string, nickname: string): IPeer };
}) {
  const [url, setUrl] = useState("http://localhost:9000");
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState("");
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function joinRoom() {
    setError("")
    setLoading(true);
    try {
      const peer = new props.peerClass(url, nickname);
      await peer.joinRoom(room);
      setLoading(false);
      props.onConnected(peer, room);
    } catch(e) {
      setError(e.toString())
      setLoading(false);
    }
  }

  return (
    <div className="connect-form">
      {fieldFor("URL", url, setUrl)}
      {fieldFor("Nickname", nickname, setNickname)}
      {fieldFor("Room", room, setRoom)}
      {error && <p style={{color: "red"}}>error</p>}
      <Button
        primary
        disabled={[url, nickname, room].some(it => it === "") || isLoading}
        onClick={joinRoom}
        loading={isLoading}
      >
        Connect
      </Button>
    </div>
  );
}
