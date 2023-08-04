import { IHttpServerComponent, Lifecycle } from '@well-known-components/interfaces'
import { setupRouter } from './controller/routes.js'
import { EnvironmentConfig } from './Environment.js'
import { startSynchronization } from './logic/synchronization.js'
import { migrateContentFolderStructure } from './migrations/ContentFolderMigrationManager.js'
import { AppComponents, GlobalContext } from './types.js'
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
  const globalContext: GlobalContext = {
    components
  }

  await migrateContentFolderStructure(components)

  // first of all, run the migrations
  await components.migrationManager.run()

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
    await startSynchronization(components)
  } else {
    components.synchronizationState.toSyncing()
  }
}
