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
  onConnected: (peer: IPeer) => any;
  peerClass: { new (url: string, nickname: string): IPeer };
}) {
  const [url, setUrl] = useState("");
  const [nickname, setNickname] = useState("");
  const [room, setRoom] = useState("");

  function joinRoom() {
      const peer = new props.peerClass(url, nickname);
      peer.joinRoom(room)
      props.onConnected(peer)
  }

  return (
    <div className="connect-form">
      {fieldFor("URL", url, setUrl)}
      {fieldFor("Nickname", nickname, setNickname)}
      {fieldFor("Room", room, setRoom)}

      <Button
        primary
        disabled={[url, nickname, room].some(it => it === "")}
        onClick={joinRoom}
      >
        Connect
      </Button>
    </div>
  );
}
