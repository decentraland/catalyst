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
import { SmartContentServerFetcher } from "./utils/SmartContentServerFetcher";
import { initializeCryptoRoutes } from "./apis/crypto/routes";
import { initializeImagesRoutes } from "./apis/images/routes";
import { initializeContractRoutes } from "./apis/contracts/routes";
import { initializeCollectionsRoutes } from "./apis/collections/routes";
import { initializeExploreRoutes } from "./apis/explore/routes";

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

    // Functionality for Explore use case
    this.app.use("/explore", initializeExploreRoutes(express.Router(),env.getBean(Bean.DAO), fetcher))

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
