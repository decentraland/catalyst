import { IHttpServerComponent, Lifecycle } from '@well-known-components/interfaces'
import { setupRouter } from './controller/routes'
import { EnvironmentConfig } from './Environment'
import { startSynchronization } from './logic/synchronization'
import { migrateContentFolderStructure } from './migrations/ContentFolderMigrationManager'
import { AppComponents, GlobalContext, UPLOADS_DIRECTORY } from './types'
import path from 'path'
import fs from 'fs'

async function purgeUploadsDirectory({ logs, fs }: Pick<AppComponents, 'logs' | 'fs'>): Promise<void> {
  const logger = logs.getLogger('purge-uploads-directory')
  logger.info("Cleaning up the Server's uploads directory...")
  try {
    const directory = UPLOADS_DIRECTORY
    const files = await fs.readdir(directory)
    files.forEach(async (file) => {
      await fs.unlink(path.join(directory, file))
    })
    logger.info('Cleaned up!')
  } catch (e) {
    logger.error('There was an error while cleaning up the upload directory: ', e)
  }
}

async function setupApiCoverage(server: IHttpServerComponent<GlobalContext>) {
  // Write object to disk because Jest runs tests in isolated environments
  const coverageDir = path.join(__dirname, '../api-coverage')
  try {
    await fs.promises.access(coverageDir)
  } catch (err) {
    await fs.promises.mkdir(coverageDir)
  }
  const coverageFilePath = path.join(coverageDir, `api-coverage-${process.pid}.csv`)
  server.use(async (context, next) => {
    const response = await next()
    await fs.promises.appendFile(
      coverageFilePath,
      `${context.url.pathname},${context.request.method},${response.status}\n`
    )
    return response
  })
}

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents>): Promise<void> {
  const { components, startComponents } = program
  const globalContext: GlobalContext = {
    components
  }

  const { logs, fs } = components
  await migrateContentFolderStructure(components)

  // first of all, run the migrations
  await components.migrationManager.run()

  const router = await setupRouter(globalContext)

  // if (process.env.API_COVERAGE === 'true') {
  await setupApiCoverage(components.server)
  // }

  // register routes middleware
  components.server.use(router.middleware())
  // register not implemented/method not allowed/cors responses middleware
  components.server.use(router.allowedMethods())
  // set the context to be passed to the handlers
  components.server.setContext(globalContext)

  await purgeUploadsDirectory({ logs, fs })

  // start ports: db, listeners, synchronizations, etc
  await startComponents()

  // synchronization
  const disableSynchronization = components.env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION)

  if (!disableSynchronization) {
    await startSynchronization(components)
  } else {
    components.synchronizationState.toSyncing()
  }
}
