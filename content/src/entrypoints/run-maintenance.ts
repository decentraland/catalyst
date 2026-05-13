import { createFolderBasedFileSystemContentStorage, createFsComponent } from '@dcl/catalyst-storage'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@dcl/metrics'
import path from 'path'
import { EnvironmentBuilder, EnvironmentConfig } from '../Environment'
import { createGarbageCollectionComponent } from '../logic/garbage-collection'
import { metricsDeclaration } from '../metrics'
import { migrateContentFolderStructure } from '../migrations/ContentFolderMigrationManager'
import { createMigrationExecutor } from '../migrations/migration-executor'
import { createDatabaseComponent } from '../adapters/database'
import { createContentFilesRepository } from '../adapters/content-files-repository'
import { createDeploymentsRepository } from '../adapters/deployments-repository'
import { createSnapshotsRepository } from '../adapters/snapshots-repository'
import { createSystemProperties } from '../adapters/system-properties'
import { ActiveEntities } from '../logic/active-entities'
import { MaintenanceComponents } from '../types'

void Lifecycle.run({
  async main(program: Lifecycle.EntryPointParameters<MaintenanceComponents>): Promise<void> {
    const { components, startComponents, stop } = program

    await components.migrationManager.run()

    await migrateContentFolderStructure(components)

    await startComponents()

    await components.garbageCollectionManager.deleteUnreferencedFiles()

    await stop()
  },

  async initComponents() {
    const logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'INFO'
      })
    })
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const env = await new EnvironmentBuilder().build()
    const database = await createDatabaseComponent({ logs, env, metrics })
    const fs = createFsComponent()
    const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    // This must run with a FolderBasedFileSystem implementation of IContentStorageComponent
    const storage = await createFolderBasedFileSystemContentStorage({ fs, logs }, contentStorageFolder)
    const migrationManager = createMigrationExecutor({ logs, env })
    const contentFilesRepository = createContentFilesRepository()
    const deploymentsRepository = createDeploymentsRepository()
    const snapshotsRepository = createSnapshotsRepository()
    const systemProperties = createSystemProperties({ database })
    // `deleteUnreferencedFiles` is the only GC method this entrypoint invokes; the
    // periodic-sweep paths that need `activeEntities` are never called here, so a
    // throwing stub is sufficient. If a future maintenance command exercises those
    // paths, replace this with a real ActiveEntities construction.
    const activeEntities = buildActiveEntitiesStub()
    const garbageCollectionManager = createGarbageCollectionComponent(
      {
        logs,
        metrics,
        database,
        storage,
        contentFilesRepository,
        deploymentsRepository,
        snapshotsRepository,
        systemProperties,
        activeEntities
      },
      false,
      0
    )
    env.logConfigValues(logs.getLogger('Environment'))
    return {
      logs,
      metrics,
      env,
      database,
      migrationManager,
      fs,
      storage,
      contentFilesRepository,
      deploymentsRepository,
      snapshotsRepository,
      garbageCollectionManager
    }
  }
})

function buildActiveEntitiesStub(): ActiveEntities {
  const notSupported = (method: string) => () => {
    throw new Error(`ActiveEntities.${method} is not available in the maintenance entrypoint`)
  }
  return {
    withPointers: notSupported('withPointers'),
    withPrefix: notSupported('withPrefix'),
    withIds: notSupported('withIds'),
    update: notSupported('update'),
    clear: notSupported('clear'),
    getCachedEntity: notSupported('getCachedEntity'),
    reset: notSupported('reset'),
    clearPointers: notSupported('clearPointers')
  }
}
