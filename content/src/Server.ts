import cors from "cors";
import log4js from "log4js";
import express, { RequestHandler } from "express";
import compression from "compression";
import morgan from "morgan";
import multer from "multer";
import http from "http";
import { Controller } from "./controller/Controller";
import { Metrics } from 'decentraland-katalyst-commons/src/metrics';
import { Environment, Bean, EnvironmentConfig } from "./Environment";
import { SynchronizationManager } from "./service/synchronization/SynchronizationManager";

export class Server {

    private static readonly LOGGER = log4js.getLogger('Server');

   private port: number;
   private app: express.Express;
   private httpServer: http.Server;
   private synchronizationManager: SynchronizationManager;

   constructor(env: Environment) {
      // Set logger
      log4js.configure({
        appenders: { console: { type: 'console', layout: { type: 'basic' } } },
        categories: { default: { appenders: [ 'console' ], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) } }
      });

      this.port = env.getConfig(EnvironmentConfig.SERVER_PORT);

      this.app = express();
      const upload = multer({ dest: 'uploads/' })
      const controller: Controller = env.getBean(Bean.CONTROLLER)
      this.synchronizationManager = env.getBean(Bean.SYNCHRONIZATION_MANAGER)

      this.app.use(compression({ filter: (req, res) => true }));
      this.app.use(cors());
      this.app.use(express.json());
      if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
        this.app.use(morgan("combined"));
      }

      if (env.getConfig(EnvironmentConfig.METRICS)) {
         Metrics.initialize(this.app);
      }

      this.registerRoute("/entities/:type"       , controller, controller.getEntities)
      this.registerRoute("/entities"             , controller, controller.createEntity, HttpMethod.POST, upload.any())
      this.registerRoute("/contents/:hashId"     , controller, controller.getContent);
      this.registerRoute("/available-content"    , controller, controller.getAvailableContent);
    //   this.registerRoute("/pointers/:type"       , controller, controller.getPointers);
      this.registerRoute("/audit/:type/:entityId", controller, controller.getAudit);
      this.registerRoute("/history"              , controller, controller.getHistory);
      this.registerRoute("/status"               , controller, controller.getStatus);
      this.registerRoute("/blacklist"            , controller, controller.getAllBlacklistTargets);
      this.registerRoute("/blacklist/:type/:id"  , controller, controller.addToBlacklist, HttpMethod.PUT);
      this.registerRoute("/blacklist/:type/:id"  , controller, controller.removeFromBlacklist, HttpMethod.DELETE);
      this.registerRoute("/blacklist/:type/:id"  , controller, controller.isTargetBlacklisted, HttpMethod.HEAD);
      this.registerRoute("/failedDeployments"    , controller, controller.getFailedDeployments);

      if (env.getConfig(EnvironmentConfig.ALLOW_LEGACY_ENTITIES)) {
        this.registerRoute("/legacy-entities"    , controller, controller.createLegacyEntity, HttpMethod.POST, upload.any())
      }
   }

   private registerRoute(route: string, controller: Controller, action: (req: express.Request, res: express.Response)=>void, method: HttpMethod = HttpMethod.GET, extraHandler?: RequestHandler) {
      const handlers: RequestHandler[] = [(req: express.Request, res: express.Response) => action.call(controller, req,res)]
      if (extraHandler) {
         handlers.unshift(extraHandler)
      }
      switch(method) {
        case HttpMethod.GET:
            this.app.get(route, handlers);
            break;
        case HttpMethod.POST:
            this.app.post(route, handlers);
            break;
        case HttpMethod.PUT:
            this.app.put(route, handlers);
            break;
        case HttpMethod.DELETE:
            this.app.delete(route, handlers);
            break;
        case HttpMethod.HEAD:
            this.app.head(route, handlers);
            break;
      }
   }

   async start(): Promise<void> {
        this.httpServer = this.app.listen(this.port, () => {
            Server.LOGGER.info(`==> Content Server listening on port ${this.port}.`);
        });
        await this.synchronizationManager.start()
   }

   async stop(): Promise<void> {
        await this.synchronizationManager.stop()
        if (this.httpServer) {
            this.httpServer.close(() => {
                Server.LOGGER.info(`==> Content Server stopped.`);
            })
        }
   }
}

enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    HEAD,
}
