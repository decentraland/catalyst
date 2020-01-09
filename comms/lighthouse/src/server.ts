import cors from "cors";
import express from "express";
import morgan from "morgan";
import { ExpressPeerServer, IRealm } from "peerjs-server";
import { Peer, RelayMode } from "../../peer/src/Peer";
import * as wrtc from "wrtc";
import WebSocket from "ws";
import { serverStorage } from "./simpleStorage";
import { util } from "../../peer/src/peerjs-server-connector/util";
import { StorageKeys } from "./storageKeys";
import { PeersService } from "./peersService";
import { configureRoutes } from "./routes";
import { LayersService } from "./layersService";

const relay = parseBoolean(process.env.RELAY ?? "false");
const accessLogs = parseBoolean(process.env.ACCESS ?? "false");
const port = parseInt(process.env.PORT ?? "9000");
const secure = parseBoolean(process.env.SECURE ?? "false");

function parseBoolean(string: string) {
  return string.toLowerCase() === "true";
}

let peer: Peer;

const app = express();

const peersService = new PeersService(getPeerJsRealm);

app.use(cors());
app.use(express.json());
if (accessLogs) {
  app.use(morgan("combined"));
}

const layersService = new LayersService({ serverPeerEnabled: relay, serverPeerProvider: () => peer, peersService });

configureRoutes(
  app,
  { layersService: layersService, realmProvider: getPeerJsRealm },
  {
    env: {
      relay,
      secure
    }
  }
);

async function getPeerToken() {
  return await serverStorage.getOrSetString(StorageKeys.PEER_TOKEN, util.generateToken(64));
}

require("isomorphic-fetch");

const server = app.listen(port, async () => {
  console.info(`==> Lighthouse listening on port ${port}.`);
  if (relay) {
    const peerToken = await getPeerToken();
    peer = new Peer(
      `${secure ? "https" : "http"}://localhost:${port}`,
      "lighthouse",
      (sender, room, payload) => {
        const message = JSON.stringify(payload, null, 3);
        console.log(`Received message from ${sender} in ${room}: ${message}`);
      },
      {
        wrtc,
        socketBuilder: url => new WebSocket(url),
        relay: RelayMode.All,
        token: peerToken,
        connectionConfig: {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302"
            },
            {
              urls: "stun:stun2.l.google.com:19302"
            },
            {
              urls: "stun:stun3.l.google.com:19302"
            },
            {
              urls: "stun:stun4.l.google.com:19302"
            }
          ]
        }
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
  console.log("User disconnected from server socket. Removing from all rooms & layers: " + client.id);
  layersService.removeUser(client.id);
});

peerServer.on("error", console.log);

export function getPeerJsRealm(): IRealm {
  return peerServer.get("peerjs-realm");
}

app.use("/peerjs", peerServer);
