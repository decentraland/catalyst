import { Lifecycle } from '@well-known-components/interfaces'
import { IHttpServerComponent } from '@dcl/core-commons'
import { setupRouter } from './controllers/routes'
import { EnvironmentConfig } from './Environment'
import { migrateContentFolderStructure } from './migrations/ContentFolderMigrationManager'
import { AppComponents, GlobalContext } from './types'
import path from 'path'
import fs from 'fs'

async function setupApiCoverage(server: IHttpServerComponent<GlobalContext>) {
  // Write object to disk because Jest runs tests in isolated environments
  const coverageDir = path.join(__dirname, '../api-coverage')
  try {
    await fs.promises.mkdir(coverageDir)
  } catch (err) {}
  const coverageFilePath = path.join(coverageDir, `api-coverage.csv`)
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
  const logger = components.logs.getLogger('service')
  const globalContext: GlobalContext = {
    components
  }

  // The WKC lifecycle only installs its SIGTERM/SIGINT handlers after main() resolves, so the
  // long-running migrations below would otherwise run with no graceful termination. Install a
  // temporary handler that exits in an orderly, logged way if a signal arrives during that window,
  // and remove it once migrations are done so the lifecycle's own handlers take over.
  const earlyShutdown = (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal} during startup migrations; exiting before components started.`)
    process.exit(0)
  }
  process.once('SIGTERM', earlyShutdown)
  process.once('SIGINT', earlyShutdown)

  try {
    await migrateContentFolderStructure(components)

    // first of all, run the migrations
    await components.migrationManager.run()
  } finally {
    process.removeListener('SIGTERM', earlyShutdown)
    process.removeListener('SIGINT', earlyShutdown)
  }

  const router = await setupRouter(globalContext)

  if (process.env.API_COVERAGE === 'true') {
    await setupApiCoverage(components.server)
  }

  // register routes middleware
  components.server.use(router.middleware())
  // register not implemented/method not allowed/cors responses middleware
  components.server.use(router.allowedMethods())
  // set the context to be passed to the handlers
  components.server.setContext(globalContext)

  // start ports: db, listeners, synchronizations, etc
  await startComponents()

  // synchronization
  const disableSynchronization = components.env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION)

  if (!disableSynchronization) {
    await components.syncOrchestrator.synchronize()
  } else {
    components.syncOrchestrator.toSyncing()
  }
}
