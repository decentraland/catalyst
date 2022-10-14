import { saveProcessedSnapshot } from '../../../src/logic/database-queries/snapshots-queries'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('precessed snapshot storage', (testEnv) => {

  testCaseWithComponents(
    testEnv,
    'should generate snapshots on startup',
    async (components) => {

      await saveProcessedSnapshot(components.database, 'anotherHash', Date.now())

      expect(await components.processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot)).toBeFalsy()
    }
  )

})
