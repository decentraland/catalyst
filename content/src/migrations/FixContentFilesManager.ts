import { AppComponents } from '../types'
import { ContentMapping } from '@dcl/schemas'
import { saveContentFiles } from '../logic/database-queries/deployments-queries'
import { join } from 'path'
import { EnvironmentConfig } from '../Environment'

export type FixMissingProfilesContentFilesComponents = Pick<
  AppComponents,
  'database' | 'env' | 'fs' | 'logs' | 'storage'
>

export async function fixMissingProfilesContentFiles(components: FixMissingProfilesContentFilesComponents) {
  const logs = components.logs.getLogger('FixMissingProfilesContentFilesManager')

  logs.info('MARIANO doing his magic')

  let contentsFolder = join(components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  while (contentsFolder.endsWith('/')) {
    contentsFolder = contentsFolder.slice(0, -1)
  }
  await components.fs.ensureDirectoryExists(contentsFolder)
  console.log(contentsFolder)

  const result = await components.database.query(`
      SELECT *
      FROM deployments d
      WHERE NOT EXISTS(
              SELECT 1
              FROM content_files cf
              WHERE cf.deployment = d.id
          )
        AND d.deleter_deployment IS NULL
        AND entity_type = 'profile'
      LIMIT 10;
`)
  console.log(`Found ${result.rowCount} profiles with missing content files.`)

  for (const deployment of result.rows) {
    const content: ContentMapping[] = deployment['entity_metadata']['v']['avatars']
      .map((avatar) => [
        { file: 'body.png', hash: avatar.avatar.snapshots['body'] },
        { file: 'face256.png', hash: avatar.avatar.snapshots['face256'] }
      ])
      .flat()

    for (const file of content) {
      await ensureFileExistsInStorage(components, file.hash)
    }
    // console.log({ content })

    await saveContentFiles(components.database, deployment.id, content)
  }
}

async function ensureFileExistsInStorage(
  components: FixMissingProfilesContentFilesComponents,
  file: string
): Promise<void> {
  if (await components.storage.exist(file)) {
    console.log(`File ${file} already exists`)
    return
  }

  // TODO Perhaps this part is not needed, because when the entity was fetched
  // from other Catalyst snapshots fetcher already downloaded.
  // The edge case is that GC could have deleted it after downloaded
  console.log(`Need to download file ${file} from other Catalyst and store`)
  // await components.storage.storeStream(file, stream)
}
