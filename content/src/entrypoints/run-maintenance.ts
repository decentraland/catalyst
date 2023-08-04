import { createFolderBasedFileSystemContentStorage, createFsComponent } from '@dcl/catalyst-storage'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import path from 'path'
import { EnvironmentBuilder, EnvironmentConfig } from '../Environment.js'
import { deleteUnreferencedFiles } from '../logic/delete-unreferenced-files.js'
import { metricsDeclaration } from '../metrics.js'
import { migrateContentFolderStructure } from '../migrations/ContentFolderMigrationManager.js'
import { createMigrationExecutor } from '../migrations/migration-executor.js'
import { createDatabaseComponent } from '../ports/postgres.js'
import { MaintenanceComponents } from '../types.js'

void Lifecycle.run({
  async main(program: Lifecycle.EntryPointParameters<MaintenanceComponents>): Promise<void> {
    const { components, startComponents, stop } = program

    await components.migrationManager.run()

    await migrateContentFolderStructure(components)

    await startComponents()

    await deleteUnreferencedFiles(components)

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
    env.logConfigValues(logs.getLogger('Environment'))
    return { logs, metrics, env, database, migrationManager, fs, storage }
  }
})
