import React from "react";
import { IPeer } from "../../peer/Peer";

export function Chat(props: { peer: IPeer }) {
  return (
    <div className="chat">
      <h1>Guelcome to the Chat {props.peer.nickname}</h1>
    </div>
  );
}
