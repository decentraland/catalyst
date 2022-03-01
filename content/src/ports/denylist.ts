import { resolve } from 'path'
import { createInterface } from 'readline'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export interface DenylistComponent {
  isDenyListed(hash: string): boolean
}

export async function createDenylistComponent(
  components: Pick<AppComponents, 'env' | 'logs' | 'fs'>
): Promise<DenylistComponent> {
  const logs = components.logs.getLogger('Denylist')
  const bannedList = new Set()

  const fileName = resolve(
    components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER),
    components.env.getConfig(EnvironmentConfig.DENYLIST_FILE_NAME)
  )

  try {
    await components.fs.existPath(fileName)

    const content = components.fs.createReadStream(fileName, {
      encoding: 'utf-8'
    })

    const lines = createInterface({
      input: content,
      crlfDelay: Infinity
    })

    for await (const line of lines) {
      bannedList.add((line as string).trim())
    }

    logs.info('Load successfully the denylist')
  } catch (err) {
    console.log('ERR', err)
    logs.warn("Couldn't load a denylist")
  }

  const isDenyListed = (hash: string): boolean => {
    return bannedList.has(hash)
  }

  return {
    isDenyListed
  }
}
