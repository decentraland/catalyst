import { resolve } from 'path'
import { EnvironmentConfig } from '../Environment'
import { createReadStream, promises } from '../helpers/fsWrapper'
import { AppComponents } from '../types'

export interface DenylistComponent {
  isDenyListed(hash: string): boolean
}

export async function createDenylistComponent(
  components: Pick<AppComponents, 'env' | 'logs'>
): Promise<DenylistComponent> {
  const logs = components.logs.getLogger('Denylist')
  const bannedList = new Set()

  const fileName = resolve(
    components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER),
    components.env.getConfig(EnvironmentConfig.DENYLIST_FILE_NAME)
  )

  try {
    await promises.access(fileName)

    const content = await createReadStream(fileName, {
      encoding: 'utf-8'
    })

    for await (const line of content) {
      bannedList.add((line as string).trim())
    }

    logs.info('Load successfully the denylist')
  } catch (err) {
    logs.warn("Couldn't load a denylist")
  }

  const isDenyListed = (hash: string): boolean => {
    return bannedList.has(hash)
  }

  return {
    isDenyListed
  }
}
