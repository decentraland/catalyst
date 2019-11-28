import React, { useState } from "react";
import { IPeer } from "../../peer/Peer";
import { Button } from "decentraland-ui";

type Message = {
  sender: string;
  content: string;
};

function MessageBubble(props: { message: Message; key: number }) {
  const { sender, content } = props.message;
  return (
    <div className="message-bubble" key={props.key}>
      <p>
        <em className="sender">{sender}</em>: {content}
      </p>
    </div>
  );
}

export function Chat(props: { peer: IPeer; room: string }) {
  //@ts-ignore
  const [messages, setMessages] = useState([
    // { sender: "migue", content: "hello" },
    // { sender: "pablo", content: "world!" }
  ] as Message[]);

  const [message, setMessage] = useState("");

  function sendMessage() {
    setMessages([...messages, {sender: props.peer.nickname, content: message}])
    // props.peer.sendMessage(props.room, message)
  }

  return (
    <div className="chat">
      <h2>Welcome to the Chat {props.peer.nickname}</h2>
      <div className="room-title">
        <h3>{props.room}</h3>
      </div>
      <div className="messages-container">
        {messages.map((it, i) => (
          <MessageBubble message={it} key={i} />
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
