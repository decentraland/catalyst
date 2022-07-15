import { Router } from 'express'
import { TheGraphClient } from '../../utils/TheGraphClient'
import { initCache, retrieveThirdPartyIntegrations } from './controllers/third-party'

export function initializeThirdPartyIntegrationsRoutes(theGraphClient: TheGraphClient, router: Router): Router {
  initCache(theGraphClient)
  return router.get('/', (_, res) => retrieveThirdPartyIntegrations(res))
}
