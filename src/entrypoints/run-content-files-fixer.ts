import {
  createFolderBasedFileSystemContentStorage,
  createFsComponent,
  IContentStorageComponent
} from '@dcl/catalyst-storage'
import { ContentMapping } from '@dcl/schemas'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createFetchComponent } from '@dcl/fetch-component'
import { IFetchComponent, ILoggerComponent, Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@dcl/metrics'
import path from 'path'
import { Readable } from 'stream'
import { Environment, EnvironmentBuilder, EnvironmentConfig } from '../Environment'
import { createContentFilesRepository } from '../adapters/content-files-repository'
import { metricsDeclaration } from '../metrics'
import { createDatabaseComponent } from '../adapters/database'
import { AppComponents } from '../types'

export type ContentFilesFixerComponents = Pick<
  AppComponents,
  'database' | 'env' | 'fetcher' | 'logs' | 'storage' | 'contentFilesRepository'
>

void Lifecycle.run({
  async main(program: Lifecycle.EntryPointParameters<ContentFilesFixerComponents>): Promise<void> {
    const { components, startComponents, stop } = program

    await startComponents()

    await fixMissingProfilesContentFiles(components)

    await stop()
  },

  async initComponents() {
    const logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'INFO'
      })
    })
    // `@dcl/fetch-component` types its result via `@dcl/core-commons`' IFetchComponent; this bag is
    // typed against `@well-known-components/interfaces`' version. They are structurally identical, so
    // assert the WKC type at the boundary (see the equivalent note in src/components.ts).
    const fetcher = createFetchComponent() as unknown as IFetchComponent
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const env = await new EnvironmentBuilder().withConfig(EnvironmentConfig.PG_QUERY_TIMEOUT, 300_000).build()
    const fs = createFsComponent()
    const database = await createDatabaseComponent({ logs, env, metrics })
    const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    const storage = await createFolderBasedFileSystemContentStorage({ fs, logs }, contentStorageFolder)
    const contentFilesRepository = createContentFilesRepository()
    env.logConfigValues(logs.getLogger('Environment'))
    return { logs, env, fetcher, database, fs, storage, contentFilesRepository }
  }
})

async function fixMissingProfilesContentFiles({
  database,
  env,
  fetcher,
  logs,
  storage,
  contentFilesRepository
}: ContentFilesFixerComponents) {
  const logger = logs.getLogger('FixMissingFilesHelper')

  const start = Date.now()
  logger.info('Fixing missing content files from profiles deployed without references to them')

  try {
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
          if (!avatar.avatar.snapshots) {
            logger.warn(`Found profile without snapshots: ${JSON.stringify(avatar)}`)
          } else {
            for (const [key, value] of Object.entries(avatar.avatar.snapshots || [])) {
              images.push({ file: `${key}.png`, hash: extract(value as string) })
            }
          }
          return images
        })
        .flat()

      try {
        for (const file of contentFiles) {
          await ensureFileExistsInStorage(env, logger, storage, fetcher, file.hash)
        }

        await database.transaction(async (databaseClient) => {
          await contentFilesRepository.saveContentFiles(databaseClient, deployment.id, contentFiles)
        }, 'save_content_files')
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
  storage: IContentStorageComponent,
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

  try {
    const data = await fetcher.fetch(url)
    if (!data.body) {
      throw new Error(`Empty response body received while downloading file ${file}`)
    }
    // `fetcher` is the native-fetch component, so `data.body` is a web `ReadableStream`. Use
    // `Readable.fromWeb` (the same adapter the multipart wrapper uses) rather than `Readable.from`,
    // which only works on a web stream by accident via its async iterator and won't propagate
    // cancellation cleanly on destroy().
    const stream = Readable.fromWeb(data.body as unknown as Parameters<typeof Readable.fromWeb>[0])
    try {
      await storage.storeStream(file, stream)
      logger.info(`File ${file} downloaded and stored successfully`)
    } catch (error: unknown) {
      stream.destroy()
      throw error
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Problem downloading file ${file}. ${message}`)
  }
}
