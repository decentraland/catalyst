import { resolve } from 'path'
import { createInterface } from 'readline'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export interface DenylistComponent {
  isDenyListed(hash: string): boolean
}

async function existPath(components: Pick<AppComponents, 'fs'>, path: string): Promise<boolean> {
  try {
    await components.fs.access(path, components.fs.constants.F_OK | components.fs.constants.R_OK)
    return true
  } catch (error) {
    return false
  }
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
    if (!(await existPath(components, fileName))) {
      const denylistFile = await components.fs.open(fileName, 'a')
      await denylistFile.close()
    }
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
    logs.warn("Couldn't load a denylist", err)
  }

  const isDenyListed = (hash: string): boolean => {
    return bannedList.has(hash)
  }

  return {
    isDenyListed
  }
}
