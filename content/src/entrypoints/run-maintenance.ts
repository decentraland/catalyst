import { createConfigComponent } from '@well-known-components/env-config-provider'
import { Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import path from 'path'
import { EnvironmentBuilder, EnvironmentConfig } from '../Environment'
import { metricsDeclaration } from '../metrics'
import { migrateContentFolderStructure } from '../migrations/ContentFolderMigrationManager'
import { MigrationManagerFactory } from '../migrations/MigrationManagerFactory'
import { createClock } from '../ports/clock'
import { createFileSystemContentStorage } from '../ports/contentStorage/fileSystemContentStorage'
import { createDeployedEntitiesBloomFilter } from '../ports/deployedEntitiesBloomFilter'
import { createFsComponent } from '../ports/fs'
import { createDatabaseComponent } from '../ports/postgres'
import { MaintenanceComponents } from '../types'

void Lifecycle.run({
  async main(program: Lifecycle.EntryPointParameters<MaintenanceComponents>): Promise<void> {
    const { components, startComponents, stop } = program

    await components.migrationManager.run()

    await migrateContentFolderStructure(components)

    await startComponents()

    // await deleteUnreferencedFiles(components)

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
    const storage = await createFileSystemContentStorage({ fs }, contentStorageFolder)
    const migrationManager = MigrationManagerFactory.create({ logs, env })
    const clock = createClock()
    const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs, clock, env })
    env.logConfigValues(logs.getLogger('Environment'))
    return { logs, metrics, env, database, migrationManager, fs, storage, deployedEntitiesBloomFilter }
  }
})
