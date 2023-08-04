import * as snapshotQueries from '../../../src/logic/database-queries/snapshots-queries'
import { TestProgram } from '../TestProgram'
import { createDefaultServer } from '../simpleTestEnvironment'

describe('snapshot storage', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    vi.restoreAllMocks()
  })

  it('should return true if the snapshot is stored', async () => {
    const { components } = server
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
