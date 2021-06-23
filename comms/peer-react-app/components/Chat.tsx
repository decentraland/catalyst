import { Button, Radio } from 'decentraland-ui'
import React, { useEffect, useRef, useState } from 'react'
import { Peer } from '../../peer/src'
import { PeerMessageTypes } from '../../peer/src/messageTypes'
import { mouse } from './Mouse'

type Message = {
  sender: string
  content: string
}

function MessageBubble(props: { message: Message; own?: boolean }) {
  const { sender, content } = props.message

  const classes = ['message-bubble']
  if (props.own) {
    classes.push('own')
  }

  return (
    <div className={classes.join(' ')}>
      <em className="sender">{sender}</em>
      <p className="content">{content}</p>
    </div>
  )
}

function CursorComponent(props: { cursor: Cursor; peerId: string }) {
  return (
    <div
      className="other-cursor"
      style={{
        left: props.cursor.x + 'px',
        top: props.cursor.y + 'px',
        backgroundColor: props.cursor.color,
        paddingLeft: '10px'
      }}
    >
      {props.peerId}
    </div>
  )
}

type Cursor = {
  x: number
  y: number
  color: string
}

// function randomColor() {
//   return "hsl(" + Math.floor(Math.random() * 359) + ", 100%, 50%)";
// }

let intervalId: number | undefined = undefined

export function Chat(props: { peer: Peer; room: string; url: string }) {
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [message, setMessage] = useState('')
  const [cursors, setCursors] = useState<Record<string, Cursor>>({})
  const [updatingCursors, setUpdatingCursors] = useState(!!new URLSearchParams(location.search).get('updatingCursors'))
  const [currentRoom, setCurrentRoom] = useState(props.room)
  const [availableRooms, setAvailableRooms] = useState([])
  const [joinedRooms, setJoinedRooms] = useState([...props.peer.currentRooms])
  const [currentIslandId, setCurrentIslandId] = useState(props.peer.getCurrentIslandId())
  const [newRoomName, setNewRoomName] = useState('')
  const messagesEndRef: any = useRef()

  document.title = props.peer.peerIdOrFail()

  props.peer.callback = (sender, room, payload) => {
    if (!joinedRooms.some((joined) => joined === room)) {
      return
    }
    switch (payload.type) {
      case 'chat':
        appendMessage(room, sender, payload.message)
        break
      case 'cursorPosition':
        setCursorPosition(sender, payload.position)
        break
      default:
        console.log('Received unknown message type: ' + payload.type)
    }
  }

  props.peer.onIslandChange = (islandId) => setCurrentIslandId(islandId)

  function setCursorPosition(sender: string, position: { x: number; y: number }) {
    if (updatingCursors) {
      const cursorColor = props.peer.isConnectedTo(sender) ? 'green' : 'red'

      props.peer.setPeerPosition(sender, [position.x, position.y, 0])

      setCursors({
        ...cursors,
        [sender]: { color: cursorColor, x: position.x, y: position.y }
      })
    }
  }

  function sendCursorMessage() {
    props.peer.sendMessage(
      currentRoom,
      { type: 'cursorPosition', position: { ...mouse } },
      PeerMessageTypes.unreliable('cursorPosition')
    )
  }

  function sendMessage() {
    appendMessage(currentRoom, props.peer.peerIdOrFail(), message)
    props.peer.sendMessage(currentRoom, { type: 'chat', message }, PeerMessageTypes.reliable('chat'))
    setMessage('')
  }

  function appendMessage(room: string, sender: string, content: string) {
    setMessages({
      ...messages,
      [room]: [...(messages[room] ?? []), { sender, content }]
    })
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    window.clearInterval(intervalId)
    if (updatingCursors) {
      intervalId = window.setInterval(() => sendCursorMessage(), 500)
    }

    return () => window.clearInterval(intervalId)
  }, [updatingCursors])

  const users = [...Object.keys(props.peer.knownPeers)]

  async function joinRoom(room: string) {
    try {
      await props.peer.joinRoom(room)
      setAvailableRooms(availableRooms.filter((r) => r !== room))
      setJoinedRooms([...props.peer.currentRooms])

      Object.keys(props.peer.knownPeers).forEach((it) => {
        const position = { x: props.peer.knownPeers[it].position![0], y: props.peer.knownPeers[it].position![1] }
        setCursorPosition(it, position)
      })
    } catch (e) {
      console.log(`error while joining room ${room}`, e)
    }
  }

  return (
    <div className="chat">
      <h2 className="welcome-message">Welcome to the Chat {props.peer.peerId}</h2>
      <div className="side">
        <h3>Current Island: {currentIslandId}</h3>
        <div>
          <h3>Available rooms</h3>
          <ul className="available-rooms">
            {availableRooms.map((room, i) => (
              <li className="available-room clickable" key={`available-room-${i}`} onDoubleClick={() => joinRoom(room)}>
                {room}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="main">
        <div className="rooms-details">
          <div className="rooms-joined">
            <h3>Rooms joined</h3>
            <ul>
              {joinedRooms.map((room, i) => (
                <li className={'room-joined' + (currentRoom === room ? ' active-room' : '')} key={`room-joined-${i}`}>
                  <button
                    disabled={room === currentRoom}
                    className="action-leave-room"
                    onClick={async () => {
                      try {
                        await props.peer.leaveRoom(room)
                        setJoinedRooms(joinedRooms.filter((joined) => room !== joined))
                      } catch (e) {
                        console.log(`error while trying to leave room ${room}`, e)
                      }
                    }}
                  >
                    x
                  </button>
                  <span
                    className={room === currentRoom ? '' : 'clickable'}
                    onClick={() => {
                      const newRoom = room
                      if (newRoom !== currentRoom) {
                        setCurrentRoom(newRoom)
                      }
                    }}
                  >
                    {room}
                  </span>
                </li>
              ))}
            </ul>
            <div className="create-room">
              <input
                className="create-room-input"
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.currentTarget.value)}
                placeholder="roomName"
              ></input>
              <button
                className="action-create-room"
                disabled={!newRoomName}
                onClick={async () => {
                  await joinRoom(newRoomName)
                  setNewRoomName('')
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
            <Radio
              toggle
              label="Sync cursors"
              checked={updatingCursors}
              onChange={(ev, data) => setUpdatingCursors(!!data.checked)}
            />
          </div>
          <div className="messages-container">
            {messages[currentRoom]?.map((it, i) => (
              <MessageBubble message={it} key={i} own={it.sender === props.peer.peerId} />
            ))}
            <div style={{ float: 'left', clear: 'both' }} ref={messagesEndRef}></div>
          </div>
          <div className="message-container">
            <textarea
              value={message}
              onChange={(ev) => setMessage(ev.currentTarget.value)}
              onKeyDown={(ev) => {
                if (message && ev.keyCode === 13 && ev.ctrlKey) sendMessage()
              }}
            />
            <Button className="send" primary disabled={!message} onClick={sendMessage}>
              Send
            </Button>
          </div>
        </div>
      </div>
      {updatingCursors && Object.keys(cursors).map((it) => <CursorComponent cursor={cursors[it]} peerId={it} />)}
    </div>
  )
}
