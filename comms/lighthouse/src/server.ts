import cors from "cors";
import express from "express";
import morgan from "morgan";
import { ExpressPeerServer, IRealm } from "peerjs-server";
import { IConfig } from "peerjs-server/dist/src/config";
import { PeersService } from "./peersService";
import { configureRoutes } from "./routes";
import { LayersService } from "./layersService";
import { Metrics } from "../../../commons/src/metrics";
import { IMessage } from "peerjs-server/dist/src/models/message";
import { MessageType } from "peerjs-server/dist/src/enums";
import * as path from "path";
import { DEFAULT_LAYERS } from "./default_layers";
import { Authenticator } from "dcl-crypto";

const relay = parseBoolean(process.env.RELAY ?? "false");
const accessLogs = parseBoolean(process.env.ACCESS ?? "false");
const port = parseInt(process.env.PORT ?? "9000");
const secure = parseBoolean(process.env.SECURE ?? "false");
const enableMetrics = parseBoolean(process.env.METRICS ?? "false");
const allowNewLayers = parseBoolean(process.env.ALLOW_NEW_LAYERS ?? "false");
const maxUsersPerLayer = parseInt(process.env.MAX_PER_LAYER ?? "50");
const existingLayers = process.env.DEFAULT_LAYERS?.split(",").map(it => it.trim()) ?? DEFAULT_LAYERS;

function parseBoolean(string: string) {
  return string.toLowerCase() === "true";
}

const app = express();

if (enableMetrics) {
  Metrics.initialize(app);
}

const peersService = new PeersService(getPeerJsRealm, secure, port);

app.use(cors());
app.use(express.json());
if (accessLogs) {
  app.use(morgan("combined"));
}

const layersService = new LayersService({ serverPeerEnabled: relay, peersService, maxUsersPerLayer, existingLayers, allowNewLayers });

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

const server = app.listen(port, async () => {
  console.info(`==> Lighthouse listening on port ${port}.`);
});

const options: Partial<IConfig> = {
  path: "/",
  authHandler: async (client, message) => {
    if (!client) {
      return false;
    }
    try {
      const result = Authenticator.validateSignature(client.getMsg(), message.payload);

      return result;
    } catch (e) {
      console.log(`error while recovering address for client ${client.getId()}`, e);
      return false;
    }
  }
};

const peerServer = ExpressPeerServer(server, options);

peerServer.on("disconnect", (client: any) => {
  console.log("User disconnected from server socket. Removing from all rooms & layers: " + client.id);
  layersService.removeUser(client.id);
});

peerServer.on("error", console.log);

//@ts-ignore
peerServer.on("message", (client: IClient, message: IMessage) => {
  if (message.type === MessageType.HEARTBEAT) {
    peersService.updateTopology(client, message);
  }
});

export function getPeerJsRealm(): IRealm {
  return peerServer.get("peerjs-realm");
}

app.use("/peerjs", peerServer);

const _static = path.join(__dirname, "../static");

app.use("/monitor", express.static(_static + "/monitor"));
