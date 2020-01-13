import React, { useState, useRef, useEffect } from "react";
import { IPeer } from "../../peer/src/types";
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

function CursorComponent(props: { cursor: Cursor }) {
  return (
    <div
      className="other-cursor"
      style={{
        left: props.cursor.x + "px",
        top: props.cursor.y + "px",
        backgroundColor: props.cursor.color
      }}
    />
  );
}

const mouse = {
  x: 0,
  y: 0
};

type Cursor = {
  x: number;
  y: number;
  color: string;
};

const mouseListener = (ev: MouseEvent) => {
  mouse.x = ev.pageX;
  mouse.y = ev.pageY;
};

function randomColor() {
  return "hsl(" + Math.floor(Math.random() * 359) + ", 100%, 50%)";
}

let intervalId: number | undefined = undefined;

export function Chat(props: { peer: IPeer; layer: string; room: string; url: string }) {
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [message, setMessage] = useState("");
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [updatingCursors, setUpdatingCursors] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(props.room);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [joinedRooms, setJoinedRooms] = useState(props.peer.currentRooms);
  const [newRoomName, setNewRoomName] = useState("");
  const messagesEndRef: any = useRef();

  props.peer.callback = (sender, room, payload) => {
    if (!joinedRooms.some(joined => joined.id === room)) {
      return;
    }
    switch (payload.type) {
      case "chat":
        appendMessage(room, sender, payload.message);
        break;
      case "cursorPosition":
        setCursorPosition(sender, payload.position);
        break;
      default:
        console.log("Received unknown message type: " + payload.type);
    }
  };

  function setCursorPosition(sender: string, position: { x: number; y: number }) {
    if (updatingCursors) {
      const cursorColor = cursors[sender]?.color ?? randomColor();

      setCursors({
        ...cursors,
        [sender]: { color: cursorColor, x: position.x, y: position.y }
      });
    }
  }

  function sendCursorMessage() {
    props.peer.sendMessage(currentRoom, { type: "cursorPosition", position: { ...mouse } }, false);
  }

  function sendMessage() {
    appendMessage(currentRoom, props.peer.nickname, message);
    props.peer.sendMessage(currentRoom, { type: "chat", message });
    setMessage("");
  }

  function appendMessage(room: string, sender: string, content: string) {
    setMessages({
      ...messages,
      [room]: [...(messages[room] ?? []), { sender, content }]
    });
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  useEffect(() => {
    document.addEventListener("mousemove", mouseListener);

    return () => document.removeEventListener("mousemove", mouseListener);
  }, []);

  useEffect(() => {
    window.clearInterval(intervalId);
    if (updatingCursors) {
      intervalId = window.setInterval(() => sendCursorMessage(), 100);
    }

    return () => window.clearInterval(intervalId);
  }, [updatingCursors]);

  useEffect(() => {
    setInterval(async () => {
      try {
        const response = await fetch(`${props.url}/layers/${props.layer}/rooms`);
        const rooms = await response.json();
        setAvailableRooms(rooms.filter(room => !joinedRooms.some(joined => joined.id === room)));
      } catch (e) {}
    }, 1000);
  }, []);

  const users = [...(joinedRooms.find(r => r.id === currentRoom)?.users?.values() ?? [])];

  async function joinRoom(room: string) {
    try {
      await props.peer.joinRoom(room);
      setAvailableRooms(availableRooms.filter(r => r !== room));
      setJoinedRooms(props.peer.currentRooms);
    } catch (e) {
      console.log(`error while joining room ${room}`, e);
    }
  }

  return (
    <div className="chat">
      <h2 className="welcome-message">Welcome to the Chat {props.peer.nickname}</h2>
      <div className="side">
        <h3>Available rooms</h3>
        <ul className="available-rooms">
          {availableRooms.map((room, i) => (
            <li className="available-room clickable" key={`available-room-${i}`} onDoubleClick={() => joinRoom(room)}>
              {room}
            </li>
          ))}
        </ul>
      </div>
      <div className="main">
        <div className="rooms-details">
          <div className="rooms-joined">
            <h3>Rooms joined</h3>
            <ul>
              {joinedRooms.map((room, i) => (
                <li className={"room-joined" + (currentRoom === room.id ? " active-room" : "")} key={`room-joined-${i}`}>
                  <button
                    disabled={room.id === currentRoom}
                    className="action-leave-room"
                    onClick={async () => {
                      try {
                        await props.peer.leaveRoom(room.id);
                        setJoinedRooms(joinedRooms.filter(joined => room.id !== joined.id));
                      } catch (e) {
                        console.log(`error while trying to leave room ${room.id}`, e);
                      }
                    }}
                  >
                    x
                  </button>
                  <span
                    className={room.id === currentRoom ? "" : "clickable"}
                    onClick={() => {
                      const newRoom = room.id;
                      if (newRoom !== currentRoom) {
                        setCurrentRoom(newRoom);
                      }
                    }}
                  >
                    {room.id}
                  </span>
                </li>
              ))}
            </ul>
            <div className="create-room">
              <input className="create-room-input" value={newRoomName} onChange={event => setNewRoomName(event.currentTarget.value)} placeholder="roomName"></input>
              <button
                className="action-create-room"
                disabled={!newRoomName}
                onClick={async () => {
                  await joinRoom(newRoomName);
                  setNewRoomName("");
                }}
              >
                +
              </button>
            </div>
          </div>
          <div className="room-users">
            <h3>Users in room</h3>
            <ul>
              {users.map((user, i) => (
                <li className="room-user" key={`room-user-${i}`}>
                  {user}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="current-room">
          <div className="room-title">
            <h3>
              Now in <i>{currentRoom}</i>
            </h3>
            <Radio toggle label="Sync cursors" checked={updatingCursors} onChange={(ev, data) => setUpdatingCursors(!!data.checked)} />
          </div>
          <div className="messages-container">
            {messages[currentRoom]?.map((it, i) => (
              <MessageBubble message={it} key={i} own={it.sender === props.peer.nickname} />
            ))}
            <div style={{ float: "left", clear: "both" }} ref={messagesEndRef}></div>
          </div>
          <div className="message-container">
            <textarea
              value={message}
              onChange={ev => setMessage(ev.currentTarget.value)}
              onKeyDown={ev => {
                if (message && ev.keyCode === 13 && ev.ctrlKey) sendMessage();
              }}
            />
            <Button className="send" primary disabled={!message} onClick={sendMessage}>
              Send
            </Button>
          </div>
        </div>
      </div>
      {updatingCursors && Object.values(cursors).map(it => <CursorComponent cursor={it} />)}
    </div>
  );
}
