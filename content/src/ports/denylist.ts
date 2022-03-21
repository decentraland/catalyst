import { IBaseComponent } from '@well-known-components/interfaces'
import { resolve } from 'path'
import { createInterface } from 'readline'
import { URL } from 'url'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'
import { FSComponent } from './fs'

export interface Denylist {
  isDenylisted(id: string): boolean
}

export async function createDenylist(
  components: Pick<AppComponents, 'env' | 'logs' | 'fetcher'> & {
    fs: Pick<FSComponent, 'createReadStream' | 'existPath'>
  }
): Promise<Denylist & IBaseComponent> {
  const logger = components.logs.getLogger('Denylist')
  const deniedContentIdentifiers = new Set()
  const fileName = resolve(
    components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER),
    components.env.getConfig(EnvironmentConfig.DENYLIST_FILE_NAME)
  )

  const denylistsUrlsRaw = components.env.getConfig<string>(EnvironmentConfig.DENYLIST_URLS)?.split(/[\r\n\s]+/gm) ?? []
  const denylistsUrls: URL[] = denylistsUrlsRaw
    .filter((url) => {
      try {
        new URL(url)
        return true
      } catch {
        logger.error(`Invalid url to fetch denylisted items: ${url}`)
        return false
      }
    })
    .map((url) => new URL(url))
  logger.info(`Location of the denylist file: ${fileName}`)
  logger.info(`Valid urls where to fetch denylisted items: ${denylistsUrls}`)

  const processLines = async (lines: Iterable<string> | AsyncIterable<string>) => {
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

  const loadDenylistFromFile = async () => {
    if (!fileName) return
    if (!(await components.fs.existPath(fileName))) {
      logger.info("Denylist file doesn't exist", { fileName })
      return
    }

    const content = components.fs.createReadStream(fileName, { encoding: 'utf-8' })

    const lines = createInterface({ input: content, crlfDelay: Infinity })

    await processLines(lines)
  }

  const loadDenylistFromUrl = async (downloadableLink: URL) => {
    try {
      const response = await components.fetcher.fetch(downloadableLink.toString())
      const content = await response.text()
      const lines = content ? content.split(/[\r\n\s]+/) : []
      await processLines(lines)
    } catch (err: any) {
      logger.error(err)
    }
  }

  const loadDenylists = async () => {
    try {
      await loadDenylistFromFile()

      for (const url of denylistsUrls) {
        await loadDenylistFromUrl(url)
      }
    } catch (err) {
      logger.error(err)
    }
  }

  await loadDenylists()
  const reloadTimer = setInterval(() => loadDenylists().catch(logger.error), 120_000 /* two minutes */)

  return {
    isDenylisted: (id: string): boolean => {
      return deniedContentIdentifiers.has(id)
    },
    async stop() {
      clearInterval(reloadTimer)
    }
  }
}
