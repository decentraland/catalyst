import { IBaseComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { resolve } from 'path'
import { createInterface } from 'readline'
import { URL } from 'url'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export interface DenylistComponent {
  isDenyListed(hash: string): boolean
}

type DenylistAdd = {
  add(cid: string): void
  clear(): void
}

async function loadDenyListFromFile(
  logger: ILoggerComponent.ILogger,
  components: Pick<AppComponents, 'fs'>,
  fileName: string,
  deniedContentIdentifiers: DenylistAdd
) {
  if (!fileName) return

  if (!(await components.fs.existPath(fileName))) {
    logger.error("Denylist file doesn't exist", { fileName })
    return
  }

  const content = components.fs.createReadStream(fileName, {
    encoding: 'utf-8'
  })

  const lines = createInterface({
    input: content,
    crlfDelay: Infinity
  })

  await processLines(logger, deniedContentIdentifiers, lines)
}

async function processLines(
  logger: ILoggerComponent.ILogger,
  deniedContentIdentifiers: DenylistAdd,
  lines: Iterable<string> | AsyncIterable<string>
) {
  for await (const line of lines) {
    try {
      const cid = line.trim()
      if (!cid.startsWith('#')) {
        deniedContentIdentifiers.add((line as string).trim())
      }
    } catch (err: any) {
      logger.error(err)
    }
  }
}

async function loadDenyListFromUrl(
  logger: ILoggerComponent.ILogger,
  components: Pick<AppComponents, 'fetcher'>,
  downloadableLink: string,
  deniedContentIdentifiers: DenylistAdd
) {
  if (!downloadableLink) return

  try {
    const url = new URL(downloadableLink)
    const response = await components.fetcher.fetch(url.toString())
    const content = await response.text()
    const lines = content.split(/[\r\n\s]+/)
    await processLines(logger, deniedContentIdentifiers, lines)
  } catch (err: any) {
    logger.error(err)
  }
}

async function reloadDenyLists(
  logger: ILoggerComponent.ILogger,
  components: Pick<AppComponents, 'env' | 'fs' | 'fetcher'>,
  deniedContentIdentifiers: DenylistAdd
) {
  const fileName = resolve(
    components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER),
    components.env.getConfig(EnvironmentConfig.DENYLIST_FILE_NAME)
  )

  components.env.getConfig(EnvironmentConfig.DENYLIST_FILE_NAME)

  try {
    await loadDenyListFromFile(logger, components, fileName, deniedContentIdentifiers)

    const denylistsUrls = components.env.getConfig<string>(EnvironmentConfig.DENYLIST_URLS)?.split(/[\r\n\s]+/gm)

    for (const url of denylistsUrls) {
      await loadDenyListFromUrl(logger, components, url, deniedContentIdentifiers)
    }

    logger.info('Load successfully the denylist')
  } catch (err) {
    logger.error(err)
  }
}

export async function createDenylistComponent(
  components: Pick<AppComponents, 'env' | 'logs' | 'fs' | 'fetcher'>
): Promise<DenylistComponent & IBaseComponent> {
  const logger = components.logs.getLogger('Denylist')
  const bannedList = new Set()

  await reloadDenyLists(logger, components, bannedList)

  const timer = setInterval(
    () => reloadDenyLists(logger, components, bannedList).catch(logger.error),
    120_000 /* two minutes */
  )

  const isDenyListed = (hash: string): boolean => {
    return bannedList.has(hash)
  }

  return {
    isDenyListed,
    async stop() {
      clearInterval(timer)
    }
  }
}
