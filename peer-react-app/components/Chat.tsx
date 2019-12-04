import React, { useState, useRef, useEffect } from "react";
import { IPeer } from "../../peer/src/Peer";
import { Button, Radio } from "decentraland-ui";

type Message = {
  sender: string;
  content: string;
};

function MessageBubble(props: { message: Message; own?: boolean }) {
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

function CursorComponent(props: {cursor: Cursor}) {
  return <div className="other-cursor" style={
      {
        left: props.cursor.x + "px",
        top: props.cursor.y + "px", 
        backgroundColor: props.cursor.color
      }
  } />
}

const mouse = {
  x: 0,
  y: 0
}

type Cursor = {
  x: number;
  y: number;
  color: string;
}

const mouseListener = (ev: MouseEvent) => {
  mouse.x = ev.pageX
  mouse.y = ev.pageY
}

function randomColor() {
  return "hsl(" + Math.floor(Math.random() * 359) + ", 100%, 50%)";
}

let intervalId: number | undefined = undefined

export function Chat(props: { peer: IPeer; room: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [cursors, setCursors] = useState<Record<string, Cursor>>({})
  const [updatingCursors, setUpdatingCursors] = useState(false)
  const messagesEndRef: any = useRef();

  props.peer.callback = (sender, room, payload) => {
    if (room !== props.room) {
      return;
    }
    switch (payload.type) {
      case "chat":
        appendMessage(sender, payload.message);
        break;
      case "cursorPosition":
        setCursorPosition(sender, payload.position)
        break;
      default:
          console.log("Received unknown message type: " + payload.type)
    }
  };

  function setCursorPosition(sender: string, position: {x: number, y: number}) {
    if(updatingCursors){
      const cursorColor = cursors[sender]?.color ?? randomColor()

      setCursors({
        ...cursors,
        [sender]: {color: cursorColor, x: position.x, y: position.y }
      })
    }
  }

  function sendCursorMessage() {
    console.log({ type: "cursorPosition", position: { ...mouse } })
    props.peer.sendMessage(
      props.room,
      { type: "cursorPosition", position: { ...mouse } },
      false
    );
  }

  function sendMessage() {
    appendMessage(props.peer.nickname, message);
    props.peer.sendMessage(props.room, { type: "chat", message });
    setMessage("");
  }

  function appendMessage(sender, content) {
    setMessages([...messages, { sender, content }]);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  useEffect(() => {
    document.addEventListener("mousemove", mouseListener)

    return () => document.removeEventListener("mousemove", mouseListener)
  }, [])

  useEffect(() => {
    window.clearInterval(intervalId);
    if(updatingCursors) {
      intervalId = window.setInterval(
        () => sendCursorMessage()
      , 100)
    }

    return () => window.clearInterval(intervalId)
  }, [updatingCursors]);

  return (
    <div className="chat">
      <h2>Welcome to the Chat {props.peer.nickname}</h2>
      <div className="room-title">
        <h3>{props.room}</h3>
        <Radio
          toggle
          label="Sync cursors"
          checked={updatingCursors}
          onChange={(ev, data) => setUpdatingCursors(!!data.checked)}
        />
      </div>
      <div className="messages-container">
        {messages.map((it, i) => (
          <MessageBubble
            message={it}
            key={i}
            own={it.sender === props.peer.nickname}
          />
        ))}
        <div
          style={{ float: "left", clear: "both" }}
          ref={messagesEndRef}
        ></div>
      </div>
      <div className="message-container">
        <textarea
          value={message}
          onChange={  ev => setMessage(ev.currentTarget.value)}
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
      {updatingCursors && Object.values(cursors).map(it => <CursorComponent cursor={it} />)}
    </div>
  );
}
