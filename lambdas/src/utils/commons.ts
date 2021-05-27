import { fetchJson } from 'dcl-catalyst-commons'
import { Logger } from 'log4js'

export async function getCommsServerUrl(
  logger: Logger,
  internalCommsServerUrl: string,
  externalCommsServerUrl?: string
): Promise<string> {
  this.commsServerUrl = externalCommsServerUrl

  try {
    await fetchJson(`${internalCommsServerUrl}/status`, {
      attempts: 6,
      waitTime: '10s'
    })
    return internalCommsServerUrl
  } catch {
    logger.info('Defaulting to external comms server url')
  }

  return externalCommsServerUrl || internalCommsServerUrl
}
