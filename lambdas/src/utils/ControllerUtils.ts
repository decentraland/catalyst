import { Fetcher } from 'dcl-catalyst-commons'
import { Logger } from 'log4js'

const INTERNAL_COMMS_SERVER_URL: string = `http://comms-server:6969`

export function asArray<T>(elements: T[] | T): T[] {
  if (!elements) {
    return []
  }
  if (elements instanceof Array) {
    return elements
  }
  return [elements]
}
export function asInt(value: any): number | undefined {
  if (value) {
    const parsed = parseInt(value)
    if (!isNaN(parsed)) {
      return parsed
    }
  }
}

export async function getCommsServerUrl(logger: Logger, externalCommsServerUrl?: string): Promise<string> {
  this.commsServerUrl = externalCommsServerUrl

  try {
    const fetcher = new Fetcher()
    await fetcher.fetchJson(`${INTERNAL_COMMS_SERVER_URL}/status`, {
      attempts: 6,
      waitTime: '10s'
    })
    return INTERNAL_COMMS_SERVER_URL
  } catch {
    logger.info('Defaulting to external comms server url')
  }

  return externalCommsServerUrl || ''
}
