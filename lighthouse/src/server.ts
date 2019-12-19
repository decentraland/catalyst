import cors from "cors";
import express from "express";
import { Response } from "express";
import morgan from "morgan";
import { ExpressPeerServer, IRealm } from "peerjs-server";
import { Peer, RelayMode } from "../../peer/src/Peer";
import * as wrtc from "wrtc";
import WebSocket from "ws";
import { RoomsService } from "./roomsService";
import { serverStorage } from "./simpleStorage";
import { util } from "../../peer/src/peerjs-server-connector/util";
import { StorageKeys } from "./storageKeys";
import { PeerHeaders } from "../../peer/src/peerjs-server-connector/enums";

const relay = parseBoolean(process.env.RELAY ?? "false");
const accessLogs = parseBoolean(process.env.ACCESS ?? "false");
const port = parseInt(process.env.PORT ?? "9000");

function parseBoolean(string: string) {
  return string.toLowerCase() === "true";
}

let peer: Peer;

// process.on("unhandledRejection", error => {
//   console.log("unhandledRejection", error);
// });

const app = express();

//Validations
async function requireParameters(
  paramNames: string[],
  obj: object,
  response: Response,
  then: () => any
) {
  const missing = paramNames.filter(param => typeof obj[param] === "undefined");

  if (missing.length > 0) {
    response.status(400).send({
      status: "bad-request",
      message: `Missing required parameters: ${missing.join(",")}`
    });
  } else {
    await then();
  }
}

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
app.put("/rooms/:roomId", async (req, res, next) => {
  const { roomId } = req.params;
  await requireParameters(["userId", "peerId"], req.body, res, async () => {
    try {
      await validatePeerToken(req, res, async () => {
        const room = await roomsService.addUserToRoom(roomId, req.body);
        res.send(room);
      });
    } catch (err) {
      next(err);
    }
  });
});

// DELETE /room/:id/:userId -> deletes a user from a room. If the room remains empty, it deletes the room.
app.delete("/rooms/:roomId/users/:userId", async (req, res, next) => {
  const { roomId, userId } = req.params;
  await validatePeerToken(req, res, () => {
    const room = roomsService.removeUserFromRoom(roomId, userId);
    res.send(room);
  });
});

async function validatePeerToken(req, res, then: () => any) {
  const existingClient = getPeerJsRealm().getClientById(req.body.userId);
  if (
    existingClient &&
    existingClient.getToken() != req.header(PeerHeaders.PeerToken)
  ) {
    res.status(401).send({ status: "invalid-token" });
  } else {
    await then();
  }
}

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
      `http://localhost:${port}`,
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
