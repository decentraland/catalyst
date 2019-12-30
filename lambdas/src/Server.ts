import cors from "cors";
import express, { RequestHandler } from "express";
import morgan from "morgan";
import { Controller } from "./controller/Controller";
import { Environment, Bean, EnvironmentConfig } from "./Environment";
import http from "http";
import { initializeWearablesRoutes } from "./apis/wearables/routes";

export class Server {
   private port: number;
   private app: express.Express;
   private httpServer: http.Server;

   constructor(env: Environment) {
      this.port = env.getConfig(EnvironmentConfig.SERVER_PORT);

      this.app = express();
      const controller: Controller = env.getBean(Bean.CONTROLLER)

      this.app.use(cors());
      this.app.use(express.json());
      if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
        this.app.use(morgan("combined"));
      }

      // Base endpoints
      this.registerRoute("/status"               , controller, controller.getStatus);

      // Backwards compatibility for older Content API

      // Profile API implementation

      // Wearables API implementation
      this.app.use("/wearables", initializeWearablesRoutes(express.Router()))
    }

   private registerRoute(route: string, controller: Controller, action: (req: express.Request, res: express.Response)=>void, isPost?:boolean, extraHandler?: RequestHandler) {
      const handlers: RequestHandler[] = [(req: express.Request, res: express.Response) => action.call(controller, req,res)]
      if (extraHandler) {
         handlers.unshift(extraHandler)
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
            })
        }
   }
}
