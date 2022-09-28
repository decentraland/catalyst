
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Environment, EnvironmentBuilder } from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { ContentStorage } from '../../../src/ports/contentStorage/contentStorage'
import { Denylist } from '../../../src/ports/denylist'
import { createFsComponent } from '../../../src/ports/fs'
import { createDatabaseComponent, IDatabaseComponent } from '../../../src/ports/postgres'
import { createSnapshotGenerator } from '../../../src/ports/snapshotGenerator'

describe('generate snapshot', () => {

  const fs = createFsComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const staticConfigs = { contentStorageFolder: 'storage', tmpDownloadFolder: '' }
  const snapshotManager = {
    getSnapshotMetadataPerEntityType: jest.fn(),
    getFullSnapshotMetadata: jest.fn(),
    generateSnapshots: jest.fn()
  }
  const denylist: Denylist = { isDenylisted: jest.fn() }
  let storage: ContentStorage
  let logs: ILoggerComponent
  let database: IDatabaseComponent
  let env: Environment

  beforeAll(async () => {
    logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'DEBUG'
      })
    })
    env = await (new EnvironmentBuilder()).build()
    database = await createDatabaseComponent({ logs, metrics, env })
  })

  it('should stream active entities with given time range', async () => {
    createSnapshotGenerator({ database, fs, metrics, logs, staticConfigs, storage, denylist, snapshotManager })
  })
})
