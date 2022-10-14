import { getProcessedSnapshots, saveProcessedSnapshot } from '../../../src/logic/database-queries/snapshots-queries'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('precessed snapshot storage', (testEnv) => {

  describe('wasSnapshotProcessed', () => {
    testCaseWithComponents(
      testEnv,
      'should return no failed deployments after start if there no one in the db',
      async (components) => {
        const processedSnapshot = 'someHash'
        await saveProcessedSnapshot(components.database, 'anotherHash', Date.now())

        expect(await components.processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot)).toBeFalsy()
      }
    )

    testCaseWithComponents(
      testEnv,
      'should return true when snapshot was processed',
      async (components) => {
        const processedSnapshot = 'someHash'
        await saveProcessedSnapshot(components.database, processedSnapshot, Date.now())

        expect(await components.processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot)).toBeTruthy()
      }
    )

    testCaseWithComponents(
      testEnv,
      'should return true when snapshot was not processed but did all the replaced ones',
      async (components) => {
        const processedSnapshot = 'someHash'
        const replacedHashes = ['h1', 'h2']
        for (const hash of replacedHashes) {
          await saveProcessedSnapshot(components.database, hash, Date.now())
        }

        expect(await components.processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeTruthy()
      }
    )

    testCaseWithComponents(
      testEnv,
      'should return true when snapshot was not processed and did some but not all the replaced ones',
      async (components) => {
        const processedSnapshot = 'someHash'
        const replacedHashes = ['h1', 'h2']
        await saveProcessedSnapshot(components.database, 'h1', Date.now())

        expect(await components.processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeFalsy()
      }
    )

    testCaseWithComponents(
      testEnv,
      'when all the replaced hashes were processed, should save the new snapshot hash and delete the replaced ones',
      async (components) => {
        const processedSnapshot = 'someHash'
        const replacedHashes = ['h1', 'h2']
        for (const hash of replacedHashes) {
          await saveProcessedSnapshot(components.database, hash, Date.now())
        }

        expect(await components.processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeTruthy()
        expect(await getProcessedSnapshots(components, [processedSnapshot, ...replacedHashes]))
          .toEqual(new Set([processedSnapshot]))
      }
    )

    testCaseWithComponents(
      testEnv,
      'when only some of the replaced snapshots were processed, it should not save the new snapshot hash and do not delete the replaced ones',
      async (components) => {
        const processedSnapshot = 'someHash'
        const replacedHashes = ['h1', 'h2']
        await saveProcessedSnapshot(components.database, 'h1', Date.now())

        expect(await components.processedSnapshotStorage.wasSnapshotProcessed(processedSnapshot, replacedHashes)).toBeFalsy()
        expect(await getProcessedSnapshots(components, [processedSnapshot, ...replacedHashes])).toEqual(new Set(['h1']))
      }
    )
  })

  describe('markSnapshotAsProcessed', () => {
    testCaseWithComponents(
      testEnv,
      'should save the new snapshot hash and delete the replaced ones',
      async (components) => {
        const processedSnapshot = 'someHash'
        const replacedHashes = ['h1', 'h2']
        for (const hash of replacedHashes) {
          await saveProcessedSnapshot(components.database, hash, Date.now())
        }

        await components.processedSnapshotStorage.markSnapshotProcessed(processedSnapshot, replacedHashes)
        expect(await getProcessedSnapshots(components, [processedSnapshot, ...replacedHashes]))
          .toEqual(new Set([processedSnapshot]))
      }
    )
  })

})
