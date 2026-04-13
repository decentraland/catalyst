import { createFolderBasedFileSystemContentStorage, createFsComponent } from '@dcl/catalyst-storage'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@dcl/metrics'
import path from 'path'
import { EnvironmentBuilder, EnvironmentConfig } from '../Environment'
import { deleteUnreferencedFiles } from '../logic/delete-unreferenced-files'
import { metricsDeclaration } from '../metrics'
import { migrateContentFolderStructure } from '../migrations/ContentFolderMigrationManager'
import { createPgComponent } from '@dcl/pg-component'
import { join } from 'path'
import { MaintenanceComponents } from '../types'

void Lifecycle.run({
  async main(program: Lifecycle.EntryPointParameters<MaintenanceComponents>): Promise<void> {
    const { components, startComponents, stop } = program

    // migrations are now run automatically by @dcl/pg-component during database.start()

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
    const pgConfig = createConfigComponent({
      PG_COMPONENT_PSQL_HOST: env.getConfig<string>(EnvironmentConfig.PSQL_HOST) ?? 'localhost',
      PG_COMPONENT_PSQL_PORT: String(env.getConfig<number>(EnvironmentConfig.PSQL_PORT) ?? 5432),
      PG_COMPONENT_PSQL_DATABASE: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE) ?? 'content',
      PG_COMPONENT_PSQL_USER: env.getConfig<string>(EnvironmentConfig.PSQL_USER) ?? 'postgres',
      PG_COMPONENT_PSQL_PASSWORD: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD) ?? '',
      PG_COMPONENT_IDLE_TIMEOUT: String(env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT) ?? 30000),
      PG_COMPONENT_QUERY_TIMEOUT: String(env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT) ?? 60000),
      PG_COMPONENT_STREAM_QUERY_TIMEOUT: String(env.getConfig<number>(EnvironmentConfig.PG_STREAM_QUERY_TIMEOUT) ?? 600000)
    })
    const database = await createPgComponent({ config: pgConfig, logs, metrics }, {
      migration: {
        migrationsTable: 'migrations',
        dir: join(__dirname, '../migrations/scripts'),
        direction: 'up' as const,
        count: Infinity,
        ignorePattern: '.*\\.map',
        createSchema: true,
        createMigrationsSchema: true
      }
    })
    const fs = createFsComponent()
    const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    // This must run with a FolderBasedFileSystem implementation of IContentStorageComponent
    const storage = await createFolderBasedFileSystemContentStorage({ fs, logs }, contentStorageFolder)
    env.logConfigValues(logs.getLogger('Environment'))
    return { logs, metrics, env, database, fs, storage }
  }
})
