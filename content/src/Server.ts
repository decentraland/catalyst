import cors from "cors";
import log4js from "log4js";
import { once } from "events";
import express, { RequestHandler, NextFunction } from "express";
import compression from "compression";
import morgan from "morgan";
import multer from "multer";
import http from "http";
import { Controller } from "./controller/Controller";
import { Metrics } from "decentraland-katalyst-commons/metrics";
import { Environment, Bean, EnvironmentConfig } from "./Environment";
import { SynchronizationManager } from "./service/synchronization/SynchronizationManager";
import { MigrationManager } from "./migrations/MigrationManager";
import { MetaverseContentService } from "./service/Service";
import { GarbageCollectionManager } from "./service/garbage-collection/GarbageCollectionManager";
import { SnapshotManager } from "./service/snapshots/SnapshotManager";

export class Server {
  private static readonly LOGGER = log4js.getLogger("Server");

  private port: number;
  private app: express.Express;
  private httpServer: http.Server;
  private readonly synchronizationManager: SynchronizationManager;
  private readonly garbageCollectionManager: GarbageCollectionManager;
  private readonly snapshotManager: SnapshotManager;
  private readonly migrationManager: MigrationManager;
  private readonly service: MetaverseContentService

  constructor(env: Environment) {
    // Set logger
    log4js.configure({
      appenders: { console: { type: "console", layout: { type: "basic" } } },
      categories: { default: { appenders: ["console"], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) } }
    });

    env.logConfigValues()

    this.port = env.getConfig(EnvironmentConfig.SERVER_PORT);

    this.app = express();
    const upload = multer({ dest: "uploads/", preservePath: true });
    const controller: Controller = env.getBean(Bean.CONTROLLER);
    this.garbageCollectionManager = env.getBean(Bean.GARBAGE_COLLECTION_MANAGER);
    this.synchronizationManager = env.getBean(Bean.SYNCHRONIZATION_MANAGER);
    this.snapshotManager = env.getBean(Bean.SNAPSHOT_MANAGER);
    this.service = env.getBean(Bean.SERVICE)
    this.migrationManager = env.getBean(Bean.MIGRATION_MANAGER)

    if (env.getConfig(EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE)) {
      this.app.use(compression({ filter: (req, res) => true }));
    }

    this.app.use(cors());
    this.app.use(express.json());
    if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
      this.app.use(morgan("combined"));
    }

    if (env.getConfig(EnvironmentConfig.METRICS)) {
      Metrics.initialize(this.app);
    }

    this.registerRoute("/entities/:type", controller, controller.getEntities);
    this.registerRoute("/entities", controller, controller.createEntity, HttpMethod.POST, upload.any());
    this.registerRoute("/contents/:hashId", controller, controller.getContent);
    this.registerRoute("/available-content", controller, controller.getAvailableContent);
    this.registerRoute("/audit/:type/:entityId", controller, controller.getAudit);
    this.registerRoute("/history", controller, controller.getHistory);
    this.registerRoute("/deployments", controller, controller.getDeployments);
    this.registerRoute("/status", controller, controller.getStatus);
    this.registerRoute("/denylist", controller, controller.getAllDenylistTargets);
    this.registerRoute("/denylist/:type/:id", controller, controller.addToDenylist, HttpMethod.PUT);
    this.registerRoute("/denylist/:type/:id", controller, controller.removeFromDenylist, HttpMethod.DELETE);
    this.registerRoute("/denylist/:type/:id", controller, controller.isTargetDenylisted, HttpMethod.HEAD);
    this.registerRoute("/failedDeployments", controller, controller.getFailedDeployments);
    this.registerRoute("/challenge", controller, controller.getChallenge);
    this.registerRoute("/pointerChanges", controller, controller.getPointerChanges);
    this.registerRoute("/snapshot/:type", controller, controller.getSnapshot);

    if (env.getConfig(EnvironmentConfig.ALLOW_LEGACY_ENTITIES)) {
      this.registerRoute("/legacy-entities", controller, controller.createLegacyEntity, HttpMethod.POST, upload.any());
    }
  }

  private registerRoute(
    route: string,
    controller: Controller,
    action: (req: express.Request, res: express.Response) => void,
    method: HttpMethod = HttpMethod.GET,
    extraHandler?: RequestHandler
  ) {
    const handlers: RequestHandler[] = [
      async (req: express.Request, res: express.Response, next: NextFunction) => {
        try {
          await action.call(controller, req, res);
        } catch (error) {
          next(error);
        }
      }
    ];
    if (extraHandler) {
      handlers.unshift(extraHandler);
    }
    switch (method) {
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
    await this.migrationManager.run()
    await this.validateHistory()
    this.httpServer = this.app.listen(this.port);
    await once(this.httpServer, "listening");
    Server.LOGGER.info(`Content Server listening on port ${this.port}.`);
    await this.snapshotManager.start();
    await this.synchronizationManager.start();
    await this.garbageCollectionManager.start();
  }

  async stop(): Promise<void> {
    await Promise.all([ this.garbageCollectionManager.stop(), this.synchronizationManager.stop() ]);
    if (this.httpServer) {
      this.httpServer.close(() => {
        Server.LOGGER.info(`Content Server stopped.`);
      });
    }
  }

  private async validateHistory() {
    // Validate last history entry is before Date.now()
    const lastDeployments = await this.service.getDeployments({ }, 0, 1)
    if (lastDeployments.deployments.length > 0) {
        const currentTimestamp = Date.now()
        if (lastDeployments.deployments[0].auditInfo.localTimestamp > currentTimestamp) {
            console.error("Last stored timestamp for this server is newer than current time. The server can not be started.")
            process.exit(1)
        }
    }
}
}

enum HttpMethod {
  GET,
  POST,
  PUT,
  DELETE,
  HEAD
}
