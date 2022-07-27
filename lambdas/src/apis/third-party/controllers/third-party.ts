import { Response } from 'express'
import { TheGraphClient } from '../../../utils/TheGraphClient'
import { TimeRefreshedDataHolder } from '../../../utils/TimeRefreshedDataHolder'
import { ThirdPartyIntegration } from '../../collections/types'

let thirdPartyIntegrationsCache: TimeRefreshedDataHolder<ThirdPartyIntegration[]>

export function initCache(theGraphClient: TheGraphClient): void {
  thirdPartyIntegrationsCache = new TimeRefreshedDataHolder(() => fetchThirdPartyIntegrations(theGraphClient), '1m')
}

export async function retrieveThirdPartyIntegrations(res: Response): Promise<void> {
  const thirdPartyIntegrations = await thirdPartyIntegrationsCache.get()
  const lastUpdate = thirdPartyIntegrationsCache.lastUpdate()

  res.setHeader('Last-Modified', lastUpdate.toUTCString())
  res.status(200).send({ data: thirdPartyIntegrations })
}

async function fetchThirdPartyIntegrations(theGraphClient: TheGraphClient): Promise<ThirdPartyIntegration[]> {
  return await theGraphClient.getThirdPartyIntegrations()
}
