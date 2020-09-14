import { Router, Request, Response } from 'express'
import { getStandardErc721 } from './controllers/collections'
import { SmartContentServerFetcher } from '../../SmartContentServerFetcher'

export function initializeCollectionsRoutes(router: Router, fetcher: SmartContentServerFetcher): Router {
    router.get("/standard/erc721/:contract/:option/:emission", createHandler(fetcher, getStandardErc721))
    return router
}

function createHandler(fetcher: SmartContentServerFetcher, originalHandler: (fetcher: SmartContentServerFetcher, req: Request, res: Response)=>void): (req: Request, res: Response)=>void {
    return (req: Request, res: Response) => originalHandler(fetcher, req, res)
}