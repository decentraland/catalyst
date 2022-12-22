import { Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import path from 'path'
import { EnvironmentBuilder, EnvironmentConfig } from '../Environment'
import { metricsDeclaration } from '../metrics'
import { createFileSystemContentStorage } from '../ports/contentStorage/fileSystemContentStorage'
import { createFsComponent } from '../ports/fs'
import { createDatabaseComponent } from '../ports/postgres'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import {
  fixMissingProfilesContentFiles,
  FixMissingProfilesContentFilesComponents
} from '../migrations/FixContentFilesManager'

void Lifecycle.run({
  async main(program: Lifecycle.EntryPointParameters<FixMissingProfilesContentFilesComponents>): Promise<void> {
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
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const env = await new EnvironmentBuilder().build()
    const database = await createDatabaseComponent({ logs, env, metrics })
    const fs = createFsComponent()
    const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    const storage = await createFileSystemContentStorage({ fs }, contentStorageFolder)
    env.logConfigValues(logs.getLogger('Environment'))
    return { logs, metrics, env, database, fs, storage }
  }
})
