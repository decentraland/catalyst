import cors from "cors";
import express from "express";
import morgan from "morgan";
import { ExpressPeerServer, IRealm } from "peerjs-server";
import { Peer, RelayMode } from "../../peer/src/Peer";
import * as wrtc from "wrtc";
import WebSocket from "ws";
import { RoomsService } from "./roomsService";
import { serverStorage } from "./simpleStorage";
import { util } from "../../peer/src/peerjs-server-connector/util";
import { StorageKeys } from "./storageKeys";
import { requireParameters, validatePeerToken } from "./handlers";
import * as path from "path";

const relay = parseBoolean(process.env.RELAY ?? "false");
const accessLogs = parseBoolean(process.env.ACCESS ?? "false");
const port = parseInt(process.env.PORT ?? "9000");
const secure = parseBoolean(process.env.SECURE ?? "false");

function parseBoolean(string: string) {
  return string.toLowerCase() === "true";
}

let peer: Peer;

const app = express();

//Services
const roomsService = new RoomsService({
  relay,
  serverPeerProvider: () => peer,
  realmProvider: getPeerJsRealm
});

app.use(cors());
app.use(express.json());
if (accessLogs) {
  app.use(morgan("combined"));
}

app.get("/hello", (req, res, next) => {
  res.send("Hello world!!!");
});

// GET /rooms[?userId=] -> returns list of rooms. If a userId is specified, it returns the rooms which that user has joined.
app.get("/rooms", (req, res, next) => {
  res.send(roomsService.getRoomIds({ userId: req.query.userId }));
});

// GET /room/:id -> returns list of users in a room with :id
app.get("/rooms/:roomId", (req, res, next) => {
  const roomUsers = roomsService.getUsers(req.params.roomId);
  if (typeof roomUsers === "undefined") {
    res.status(404).send({ status: "not-found" });
  } else {
    res.send(roomUsers);
  }
});

// PUT /room/:id { userid, nickname } -> adds a user to a particular room. If the room doesn’t exists, it creates it.
app.put(
  "/rooms/:roomId",
  requireParameters(["userId", "peerId"], (req, res) => req.body),
  validatePeerToken(getPeerJsRealm),
  async (req, res, next) => {
    const { roomId } = req.params;
    try {
      const room = await roomsService.addUserToRoom(roomId, req.body);
      res.send(room);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /room/:id/:userId -> deletes a user from a room. If the room remains empty, it deletes the room.
app.delete(
  "/rooms/:roomId/users/:userId",
  validatePeerToken(getPeerJsRealm),
  async (req, res, next) => {
    const { roomId, userId } = req.params;
    const room = roomsService.removeUserFromRoom(roomId, userId);
    res.send(room);
  }
);

async function getPeerToken() {
  return await serverStorage.getOrSetString(
    StorageKeys.PEER_TOKEN,
    util.generateToken(64)
  );
}

require("isomorphic-fetch");

const server = app.listen(port, async () => {
  console.info(`==> Lighthouse listening on port ${port}.`);
  if (relay) {
    const peerToken = await getPeerToken();
    peer = new Peer(
      `${secure ? "https" : "http"} ://localhost:${port}`,
      "lighthouse",
      (sender, room, payload) => {
        const message = JSON.stringify(payload, null, 3);
        console.log(`Received message from ${sender} in ${room}: ${message}`);
      },
      {
        wrtc,
        socketBuilder: url => new WebSocket(url),
        relay: RelayMode.All,
        token: peerToken
      }
    );
  }
});

const options = {
  debug: true,
  path: "/"
};

const peerServer = ExpressPeerServer(server, options);

peerServer.on("disconnect", (client: any) => {
  console.log(
    "User disconnected from server socket. Removing from all rooms: " +
      client.id
  );
  roomsService.removeUser(client.id);
});

peerServer.on("error", console.log);

function getPeerJsRealm(): IRealm {
  return peerServer.get("peerjs-realm");
}

app.use("/peerjs", peerServer);
