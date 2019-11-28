import React, { useState } from "react";
import { IPeer } from "../../peer/Peer";
import { Button } from "decentraland-ui";

type Message = {
  sender: string;
  content: string;
};

function MessageBubble(props: {
  message: Message;
  own?: boolean;
}) {
  const { sender, content } = props.message;

  const classes = ["message-bubble"];
  if (props.own) {
    classes.push("own");
  }

  return (
    <div className={classes.join(" ")}>
      <em className="sender">{sender}</em>
      <p className="content">{content}</p>
    </div>
  );
}

export function Chat(props: { peer: IPeer }) {
  //@ts-ignore
  const [messages, _] = useState([
    // { sender: "migue", content: "hello" },
    // { sender: "pablo", content: "world!" }
  ] as Message[]);

  const [message, setMessage] = useState("");

  function sendMessage() {
    console.log(message.trim());
  }

  return (
    <div className="chat">
      <h2>Welcome to the Chat {props.peer.nickname}</h2>
      <div className="room-title">
        <h3>{props.peer.currentRooms.map(room => room.id).join(", ")}</h3>
      </div>
      <div className="messages-container">
        {messages.map((it, i) => (
          <MessageBubble
            message={it}
            key={i}
            own={it.sender === props.peer.nickname}
          />
        ))}
      </div>
      <div className="message-container">
        <textarea
          value={message}
          onChange={ev => setMessage(ev.currentTarget.value)}
          onKeyDown={ev => {
            if (message && ev.keyCode === 13 && ev.ctrlKey) sendMessage();
          }}
        />
        <Button
          className="send"
          primary
          disabled={!message}
          onClick={sendMessage}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
