import { Router, Request, Response } from "express";
import { hotScenes } from "./controllers/explore";
import { DAOCache } from "../../service/dao/DAOCache";
import { SmartContentClient } from "../../utils/SmartContentClient";

export function initializeExploreRoutes(router: Router, daoCache: DAOCache, contentClient: SmartContentClient): Router {
  router.get("/hot-scenes", createHandler(daoCache, contentClient, hotScenes));
  return router;
}

function createHandler(
  dao: DAOCache,
  contentClient: SmartContentClient,
  originalHandler: (daoCache: DAOCache, contentClient: SmartContentClient, req: Request, res: Response) => any
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(dao, contentClient, req, res);
}
