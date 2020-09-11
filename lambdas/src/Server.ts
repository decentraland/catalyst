import cors from "cors";
import log4js from "log4js";
import express, { RequestHandler } from "express";
import morgan from "morgan";
import compression from "compression";
import { Controller } from "./controller/Controller";
import { Environment, Bean, EnvironmentConfig } from "./Environment";
import http from "http";
import { initializeContentV2Routes } from "./apis/content-v2/routes";
import { initializeProfilesRoutes } from "./apis/profiles/routes";
import { SmartContentServerFetcher } from "./SmartContentServerFetcher";
import { initializeCryptoRoutes } from "./apis/crypto/routes";
import { initializeImagesRoutes } from "./apis/images/routes";
import { initializeContractRoutes } from "./apis/contracts/routes";
import { initializeCollectionsRoutes } from "./apis/collections/routes";

export class Server {
  private port: number;
  private app: express.Express;
  private httpServer: http.Server;

  constructor(env: Environment) {
    // Set logger
    log4js.configure({
      appenders: { console: { type: "console", layout: { type: "basic" } } },
      categories: { default: { appenders: ["console"], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) } }
    });

    this.port = env.getConfig(EnvironmentConfig.SERVER_PORT);

    this.app = express();
    const controller: Controller = env.getBean(Bean.CONTROLLER);

    if (env.getConfig(EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE)) {
      this.app.use(compression({ filter: (req, res) => true }));
    }

    this.app.use(cors());
    this.app.use(express.json());
    if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
      this.app.use(morgan("combined"));
    }

    // Base endpoints
    this.registerRoute("/status", controller, controller.getStatus);

    const fetcher: SmartContentServerFetcher = env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)

    // Backwards compatibility for older Content API
    this.app.use("/contentv2", initializeContentV2Routes(express.Router(),
        fetcher));

    // Profile API implementation
    this.app.use("/profile", initializeProfilesRoutes(express.Router(),
        fetcher,
        env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL)));

    // DCL-Crypto API implementation
    this.app.use("/crypto", initializeCryptoRoutes(express.Router(),
        env.getConfig(EnvironmentConfig.ETH_NETWORK)));

    // Images API for resizing contents
    this.app.use("/images", initializeImagesRoutes(express.Router(),
        fetcher,
        env.getConfig(EnvironmentConfig.LAMBDAS_STORAGE_LOCATION)));

    // DAO cached access API
    this.app.use("/contracts", initializeContractRoutes(express.Router(),
        env.getBean(Bean.DAO)));

    // DAO Collections access API
    this.app.use("/collections", initializeCollectionsRoutes(express.Router(),
        fetcher));

  }

  private registerRoute(route: string, controller: Controller, action: (req: express.Request, res: express.Response) => void, isPost?: boolean, extraHandler?: RequestHandler) {
    const handlers: RequestHandler[] = [(req: express.Request, res: express.Response) => action.call(controller, req, res)];
    if (extraHandler) {
      handlers.unshift(extraHandler);
    }
    if (!isPost) {
      this.app.get(route, handlers);
    } else {
      this.app.post(route, handlers);
    }
  }

  async start(): Promise<void> {
    this.httpServer = this.app.listen(this.port, () => {
      console.info(`==> Lambdas Server listening on port ${this.port}.`);
    });
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.info(`==> Lambdas Server stopped.`);
      });
    }
  }
}

/*

https://peers.decentraland.org/lambdas/wearables/erc721/<contract>/<option>/<emission>

Ejemplo:
contract: moonshot_2020
option: ms_ethermon_upper_body
emission: none
{
"id": "dcl://moonshot_2020/ms_ethermon_upper_body",
"name": "Ethermon Soccer T-Shirt",
"description": "",
"language": "en-US",
"image": "http://wearable-api.decentraland.org/v2/collections/moonshot_2020/wearables/ms_ethermon_upper_body/image",
"thumbnail": "http://wearable-api.decentraland.org/v2/collections/moonshot_2020/wearables/ms_ethermon_upper_body/thumbnail"
}

Ejemplo:
contract: moonshot_2020
option: ms_ethermon_upper_body
emission: 22
{
"id": "dcl://moonshot_2020/ms_ethermon_upper_body",
"name": "Ethermon Soccer T-Shirt",
"description": "DCL Wearable 22/100",
"language": "en-US",
"image": "http://wearable-api.decentraland.org/v2/collections/moonshot_2020/wearables/ms_ethermon_upper_body/image",
"thumbnail": "http://wearable-api.decentraland.org/v2/collections/moonshot_2020/wearables/ms_ethermon_upper_body/thumbnail"
}


https://peers.decentraland.org/lambdas/collections/standard/erc721/<contract>/<option>
{
    "id": "dcl://<contract>/<option>",
    "name": "<???>",
    "description": "",
    "language": "en-US",
    "image": "http://wearable-api.decentraland.org/v2/collections/<contract>/wearables/<option>/image",
    "thumbnail": "http://wearable-api.decentraland.org/v2/collections/<contract>/wearables/<option>/thumbnail"
}

https://peers.decentraland.org/lambdas/collections/standard/erc721/<contract>/<option>/<emission>
{
    "id": "dcl://<contract>/<option>",
    "name": "<???-1>",
    "description": "DCL Wearable <emission>/<???-2>",
    "language": "en-US",
    "image": "http://wearable-api.decentraland.org/v2/collections/<contract>/wearables/<option>/image",
    "thumbnail": "http://wearable-api.decentraland.org/v2/collections/<contract>/wearables/<option>/thumbnail"
}

*/