import { Router, Request, Response } from "express";
import { getResizedImage } from "./controllers/images";
import { SmartContentServerFetcher } from "../../SmartContentServerFetcher";
import { Environment } from  "../../Environment";

export function initializeImagesRoutes(router: Router, env: Environment, fetcher: SmartContentServerFetcher): Router {
  router.get("/:cid/:size", createHandler(env, fetcher, getResizedImage));
  return router;
}

function createHandler(
  env: Environment,
  fetcher: SmartContentServerFetcher,
  originalHandler: (env: Environment, fetcher: SmartContentServerFetcher, req: Request, res: Response) => void
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(env, fetcher, req, res);
}
