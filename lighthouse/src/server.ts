import cors from "cors";
import express from "express";
import morgan from "morgan";
import { ExpressPeerServer } from "peerjs-server";
import { Peer, RelayMode } from "../../peer/src/Peer";
import { PeerConnectionData } from "../../peer/src/types";
import * as wrtc from "wrtc";
import WebSocket from "ws";

const relay = true;
const port = process.env.PORT ?? 9000;

const rooms: Record<string, PeerConnectionData[]> = {};

let peer: Peer;

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.get("/hello", (req, res, next) => {
  res.send("Hello world!!!");
});

// GET /rooms[?userId=] -> returns list of rooms. Includes users per room by default. If a userId is specified, it returns the rooms which that user has joined.
app.get("/rooms", (req, res, next) => {
  const { userId } = req.query;
  const _rooms = userId
    ? Object.entries(rooms)
        .filter(([, users]) => users.some(user => user.userId === userId))
        .map(([id]) => id)
    : Object.keys(rooms);
  res.send(_rooms);
});

// GET /room/:id -> returns list of users in a room with :id
app.get("/rooms/:roomId", (req, res, next) => {
  res.send(rooms[req.params.roomId]);
});

// PUT /room/:id { userid, nickname } -> adds a user to a particular room. If the room doesn’t exists, it creates it.
app.put("/rooms/:roomId", async (req, res, next) => {
  const { roomId } = req.params;
  let room = rooms[roomId];
  if (!room) {
    rooms[roomId] = room = [];
    // if relaying peer exists, add to room when it's created
    if (relay) {
      await peer?.joinRoom(roomId);
    }
  }
  if (!room.some($ => $.userId === req.body.id)) {
    room.push(relay ? { ...req.body, peerId: peer.nickname } : req.body);
  }
  res.send(room);
});

// DELETE /room/:id/:userId -> deletes a user from a room. If the room remains empty, it deletes the room.
app.delete("/rooms/:roomId/users/:userId", (req, res, next) => {
  const { roomId, userId } = req.params;
  let room = rooms[roomId];
  if (room) {
    const index = room.indexOf(room.find($ => $.userId === userId) as any);
    if (index !== -1) {
      room.splice(index, 1);
    }
  }
  if (room.length === 0) {
    delete rooms[roomId];
  }
  res.end();
});

require("isomorphic-fetch");

const server = app.listen(port, () => {
  console.info(`==> Lighthouse listening on port ${port}.`);
  if (relay) {
    peer = new Peer(
      `http://localhost:${port}`,
      "lighthouse",
      (sender, room, payload) => {
        const message = JSON.stringify(payload, null, 3);
        console.log(`Received message from ${sender} in ${room}: ${message}`);
      },
      {
        wrtc,
        socketBuilder: url => new WebSocket(url),
        relay: RelayMode.All
      }
    );
  }
});

const options = {
  debug: false
};

app.use("/", ExpressPeerServer(server, options));
