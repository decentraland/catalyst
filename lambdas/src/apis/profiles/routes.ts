import { Router } from 'express'
import { getProfileById } from './controllers/profiles'

export function initializeProfilesRoutes(router: Router): Router {
    router.get("/:id", getProfileById)
    return router
}
