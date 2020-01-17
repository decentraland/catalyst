import cors from "cors";
import express from "express";
import morgan from "morgan";
import { ExpressPeerServer, IRealm } from "peerjs-server";
import { PeersService } from "./peersService";
import { configureRoutes } from "./routes";
import { LayersService } from "./layersService";
import { IMessage } from "peerjs-server/dist/src/models/message";
import { MessageType } from "peerjs-server/dist/src/enums";

const relay = parseBoolean(process.env.RELAY ?? "false");
const accessLogs = parseBoolean(process.env.ACCESS ?? "false");
const port = parseInt(process.env.PORT ?? "9000");
const secure = parseBoolean(process.env.SECURE ?? "false");

function parseBoolean(string: string) {
  return string.toLowerCase() === "true";
}

const app = express();

const peersService = new PeersService(getPeerJsRealm, secure, port);

app.use(cors());
app.use(express.json());
if (accessLogs) {
  app.use(morgan("combined"));
}

const layersService = new LayersService({ serverPeerEnabled: relay, peersService });

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
