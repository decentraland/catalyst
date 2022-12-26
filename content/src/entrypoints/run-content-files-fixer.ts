import { Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import path from 'path'
import { EnvironmentBuilder, EnvironmentConfig } from '../Environment'
import { createFileSystemContentStorage } from '../ports/contentStorage/fileSystemContentStorage'
import { createFsComponent } from '../ports/fs'
import { createDatabaseComponent } from '../ports/postgres'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import {
  ContentFilesFixerComponents,
  fixMissingProfilesContentFiles
} from '../service/garbage-collection/FixContentFilesHelper'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { metricsDeclaration } from '../metrics'
import { createFetchComponent } from '../ports/fetcher'

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
    const fetcher = createFetchComponent()
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const env = await new EnvironmentBuilder().withConfig(EnvironmentConfig.PG_QUERY_TIMEOUT, 300_000).build()
    const fs = createFsComponent()
    const database = await createDatabaseComponent({ logs, env, metrics })
    const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    const storage = await createFileSystemContentStorage({ fs }, contentStorageFolder)
    env.logConfigValues(logs.getLogger('Environment'))
    return { logs, env, fetcher, database, fs, storage }
  }
})
