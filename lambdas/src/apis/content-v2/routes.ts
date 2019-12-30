import { Router } from 'express'
import { getScenes, getInfo, getContents } from './controllers/translator'

export function initializeContentV2Routes(router: Router): Router {
	router.get("/scenes", getScenes)
	router.get("/parcel_info", getInfo)
	router.get("/contents/:cid", getContents)
    return router
}
