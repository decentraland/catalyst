import { fetchJson } from 'dcl-catalyst-commons'
import { Logger } from 'log4js'

const INTERNAL_COMMS_SERVER_URL: string = `http://comms-server:6969`

export async function getCommsServerUrl(logger: Logger, externalCommsServerUrl?: string): Promise<string> {
  this.commsServerUrl = externalCommsServerUrl

  try {
    await fetchJson(`${INTERNAL_COMMS_SERVER_URL}/status`, {
      attempts: 6,
      waitTime: '10s'
    })
    return INTERNAL_COMMS_SERVER_URL
  } catch {
    logger.info('Defaulting to external comms server url')
  }

  return externalCommsServerUrl || ''
}
