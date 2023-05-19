import { createFetchComponent } from '@well-known-components/fetch-component'
import { Logger } from 'log4js'

export async function getCommsServerUrl(
  logger: Logger,
  internalCommsServerUrl: string,
  externalCommsServerUrl?: string
): Promise<string> {
  try {
    const fetcher = createFetchComponent()
    await fetcher.fetch(`${internalCommsServerUrl}/status`, {
      attempts: 6,
      retryDelay: 10000
    })
    return internalCommsServerUrl
  } catch {
    logger.info('Defaulting to external comms server url')
  }

  return externalCommsServerUrl || internalCommsServerUrl
}
