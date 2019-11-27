import React, { useState } from "react";
import { IPeer } from "../../peer/Peer";

type Message = {
  sender: string;
  content: string;
};

function MessageBubble(props: { message: Message }) {
  const { sender, content } = props.message;
  return (
    <div className="message-bubble">
      <em className="sender">{sender}</em>
      <p className="content">{content}</p>
    </div>
  );
}

export function Chat(props: { peer: IPeer }) {
  //@ts-ignore
  const [messages, _] = useState([
    { sender: "migue", content: "hello" },
    { sender: "pablo", content: "world!" }
  ] as Message[]);

  return (
    <div className="chat">
      <h2>Welcome to the Chat {props.peer.nickname}</h2>
      <div className="room-title">
        <h3>{props.peer.currentRooms.join(", ")}</h3>
      </div>
      <div className="messages-container">
        {messages.map(it => (
          <MessageBubble message={it} />
        ))}
      </div>
    </div>
  );
}
