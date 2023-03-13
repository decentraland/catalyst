import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { setupTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

describe('snapshot storage', () => {
  const getTestEnv = setupTestEnvironment()

  describe('has', () => {
    testCaseWithComponents(getTestEnv, 'should return true if the snapshot is stored', async (components) => {
      const snapshotHash = 'snapshotHash'
      await snapshotQueries.saveSnapshot(components.database, {
        hash: snapshotHash,
        timeRange: { initTimestamp: 0, endTimestamp: 1 },
        numberOfEntities: 0,
        generationTimestamp: 2
      })

      expect(await components.snapshotStorage.has(snapshotHash)).toBeTruthy()
      expect(await components.snapshotStorage.has('another-hash')).toBeFalsy()
    })
  })
})
