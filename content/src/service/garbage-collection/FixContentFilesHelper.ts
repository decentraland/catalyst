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
      WHERE entity_type = 'profile'
      AND NOT EXISTS(
              SELECT 1
              FROM content_files cf
              WHERE cf.deployment = d.id
          )
        AND d.deleter_deployment IS NULL
    `)
    logger.info(`Found ${result.rowCount} profiles with missing content files.`)

    const regex = /Qm[a-zA-Z0-9]{44}$|^baf[a-zA-Z0-9]{56}/
    function extract(value: string): string {
      if (value && value.startsWith('http')) {
        const matches = value.match(regex)
        if (matches && matches.length > 0) {
          return matches[0]
        }
      }
      return value
    }

    for (const deployment of result.rows) {
      const contentFiles: ContentMapping[] = deployment['entity_metadata']['v']['avatars']
        .map((avatar) => {
          const images: { file: string; hash: string }[] = []
          for (const [key, value] of Object.entries(avatar.avatar.snapshots)) {
            images.push({ file: `${key}.png`, hash: extract(value as string) })
          }
          return images
        })
        .flat()

      try {
        for (const file of contentFiles) {
          await ensureFileExistsInStorage(env, logger, storage, fetcher, file.hash)
        }

        // if (false) {
        await saveContentFiles(database, deployment.id, contentFiles)
        // }
      } catch (e) {
        logger.warn(
          `Error processing deployment id ${deployment.id} for entity id ${
            deployment.entityId
          }. ContentFiles: ${JSON.stringify(contentFiles)}`
        )
      }
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
  if (!file) {
    logger.info(`Invalid file ${file}`)
    return
  }
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
