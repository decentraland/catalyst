import { Router, Request, Response } from "express";
import { hotScenes } from "./controllers/explore";
import { DAOCache } from "../../service/dao/DAOCache";
import { SmartContentServerFetcher } from "../../utils/SmartContentServerFetcher";

export function initializeExploreRoutes(router: Router, daoCache: DAOCache, fetcher: SmartContentServerFetcher): Router {
  router.get("/hot-scenes", createHandler(daoCache, fetcher, hotScenes));
  return router;
}

function createHandler(
  dao: DAOCache,
  fetcher: SmartContentServerFetcher,
  originalHandler: (daoCache: DAOCache, fetcher: SmartContentServerFetcher, req: Request, res: Response) => any
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => originalHandler(dao, fetcher, req, res);
}
