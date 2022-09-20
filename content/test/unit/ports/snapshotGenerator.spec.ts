
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { metricsDeclaration } from '../../../src/metrics'
import { ContentStorage } from '../../../src/ports/contentStorage/contentStorage'
import { Denylist } from '../../../src/ports/denylist'
import { createFsComponent } from '../../../src/ports/fs'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'
import { createSnapshotGenerator } from '../../../src/ports/snapshotGenerator'

describe('generate snapshot', () => {

  const database = createTestDatabaseComponent()
  const fs = createFsComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const staticConfigs = { contentStorageFolder: 'storage', tmpDownloadFolder: '' }
  const denylist: Denylist = { isDenylisted: jest.fn() }
  let storage: ContentStorage
  let logs: ILoggerComponent

  beforeAll(async () => {
    logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'DEBUG'
      })
    })
  })

  it('should stream active entities with given time range', async () => {
    const snapshotGenerator = createSnapshotGenerator({ database, fs, metrics, logs, staticConfigs, storage, denylist })
    if (snapshotGenerator.start) {
      await snapshotGenerator.start({ started: jest.fn(), live: jest.fn(), getComponents: jest.fn() })
    }
  })
})


// function createFileWriterMock(filePath: string, storedHash: string): IFile {
//   const fileWriterMock = {
//     filePath,
//     appendDebounced: jest.fn(),
//     close: jest.fn(),
//     delete: jest.fn(),
//     store: jest.fn().mockResolvedValue(storedHash)
//   }
//   jest.spyOn(fileWriter, 'createFileWriter').mockResolvedValue(fileWriterMock)
//   return fileWriterMock
// }

// function mockStreamedActiveEntitiesWith(entities: DeploymentWithAuthChain[]) {
//   return jest.spyOn(snapshotQueries, 'streamActiveDeploymentsInTimeRange')
//     .mockImplementation(async function* gen() {
//       for (const entity of entities) {
//         yield entity
//       }
//       return
//     })
// }
