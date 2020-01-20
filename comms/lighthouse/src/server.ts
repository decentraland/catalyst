import cors from "cors";
import express from "express";
import morgan from "morgan";
import { ExpressPeerServer, IRealm } from "peerjs-server";
import { IConfig } from "peerjs-server/dist/src/config";
import { recover } from "web3x/utils";
import { PeersService } from "./peersService";
import { configureRoutes } from "./routes";
import { LayersService } from "./layersService";
import { Metrics } from "../../../commons/src/metrics";
import { IMessage } from "peerjs-server/dist/src/models/message";
import { MessageType } from "peerjs-server/dist/src/enums";
import * as path from "path";

const relay = parseBoolean(process.env.RELAY ?? "false");
const accessLogs = parseBoolean(process.env.ACCESS ?? "false");
const port = parseInt(process.env.PORT ?? "9000");
const secure = parseBoolean(process.env.SECURE ?? "false");
const enableMetrics = parseBoolean(process.env.METRICS ?? "false");

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

const options: Partial<IConfig> = {
  path: "/",
  authHandler: async (client, message) => {
    if (!client) {
      return false;
    }
    try {
      const address = recover(client.getMsg(), message.payload);
      const result = address.toString().toLowerCase() === client.getId().toLowerCase();

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

const monitorServer = MonitorServer();

app.use("/monitor", monitorServer);

function MonitorServer() {
  return (req, res, next) => {
    res.send(
      `
      <!DOCTYPE html>
      <html lang="en"><head>
      <meta charset="UTF-8">
        <title>Decentraland Lighthouse</title>
      </head>
     
      <body>
        <div id="root">
          <script>
            async function renderTopology() {

              const layersResponse = await fetch("/layers")
              const layers = await layersResponse.json()

              if (layers.length === 0) {
                const element = document.createElement("p");
                const text = document.createTextNode("No layers found! Join peers first maybe?");
                element.appendChild(text);
                document.body.appendChild(element);
              } else {
                renderLayers(layers)
              }

            }

            async function event(precondition) {
              const checkVizModuleLoaded = (resolve, reject, attempt) => {
                if (precondition()) {
                  resolve();
                } else if (attempt > 1000) {
                  reject(new Error('viz module not loaded'));
                } else {
                  setTimeout(() => checkVizModuleLoaded(resolve, reject, attempt + 1), 100);
                }
              }

              return new Promise((resolve, reject) => {
                checkVizModuleLoaded(resolve, reject, 0)
              });
            }

            async function renderLayers(layers) {
              await event(() => typeof Viz !== "undefined");
              await event(() => typeof Viz.render !== "undefined");

              const viz = new Viz();

              for (const layer of layers) {
                const h1 = document.createElement("h1");
                const text = document.createTextNode("Layer " + layer);
                h1.appendChild(text);
                document.body.appendChild(h1);

                const response = await fetch("/layers/blue/topology?format=graphviz")
                const topology = await response.text()
                console.log('topology', topology)

                viz.renderSVGElement(topology)
                  .then(element => document.body.appendChild(element))
                  .catch(error => {
                    // Create a new Viz instance (@see Caveats page for more info)
                    viz = new Viz();

                    const element = document.createElement("p");
                    const text = document.createTextNode("Error while rendering layer");
                    element.appendChild(text);
                    document.body.appendChild(element);

                    console.error(error);
                  });
              }
            }

            renderTopology()
          </script>
          <script src="https://github.com/mdaines/viz.js/releases/download/v2.1.2/viz.js"></script>
          <script src="https://github.com/mdaines/viz.js/releases/download/v2.1.2/full.render.js"></script>
        </div>
      </body>
      </html>`
    );
  };
}
