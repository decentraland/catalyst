import { ContentMapping } from '@dcl/schemas'
import { saveContentFiles } from '../../logic/database-queries/deployments-queries'
import { join } from 'path'
import { Environment, EnvironmentConfig } from '../../Environment'
import { ContentStorage } from '../../ports/contentStorage/contentStorage'
import { Readable } from 'stream'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IFetchComponent } from '@well-known-components/http-server'
import { GarbageCollectionManagerComponents } from './GarbageCollectionManager'

export async function fixMissingProfilesContentFiles({
  database,
  env,
  fetcher,
  fs,
  logs,
  storage
}: GarbageCollectionManagerComponents) {
  const logger = logs.getLogger('FixMissingFilesHelper')

  const start = Date.now()
  logger.info('Fixing missing content files from profiles deployed without references to them')

  try {
    let contentsFolder = join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    while (contentsFolder.endsWith('/')) {
      contentsFolder = contentsFolder.slice(0, -1)
    }
    await fs.ensureDirectoryExists(contentsFolder)

    const result = await database.query(`
      SELECT *
      FROM deployments d
      WHERE NOT EXISTS(
              SELECT 1
              FROM content_files cf
              WHERE cf.deployment = d.id
          )
        AND d.deleter_deployment IS NULL
        AND entity_type = 'profile'`)
    logger.info(`Found ${result.rowCount} profiles with missing content files.`)

    for (const deployment of result.rows) {
      const contentFiles: ContentMapping[] = deployment['entity_metadata']['v']['avatars']
        .map((avatar) => [
          { file: 'body.png', hash: avatar.avatar.snapshots['body'] },
          { file: 'face256.png', hash: avatar.avatar.snapshots['face256'] }
        ])
        .flat()

      for (const file of contentFiles) {
        await ensureFileExistsInStorage(env, logger, storage, fetcher, file.hash)
      }

      await saveContentFiles(database, deployment.id, contentFiles)
    }
  } finally {
    logger.info(`Fixing missing content files took ${Date.now() - start} ms`)
  }
}

async function ensureFileExistsInStorage(
  env: Environment,
  logger: ILoggerComponent.ILogger,
  storage: ContentStorage,
  fetcher: IFetchComponent,
  file: string
): Promise<void> {
  if (await storage.exist(file)) {
    logger.info(`File ${file} already exists`)
    return
  }

  logger.info(`Need to download file ${file} from other Catalyst and store it locally`)
  const url = `https://peer.decentraland.${
    env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet' ? 'org' : 'zone'
  }/content/contents/${file}`

  await fetcher
    .fetch(url)
    .then((data) => data.body)
    .then((stream) => storage.storeStream(file, Readable.from(stream)))
    .then(() => logger.info(`File ${file} downloaded and stored successfully`))
    .catch((error: any) => logger.warn(`Problem downloading file ${file}. ${error.message}`))
}
