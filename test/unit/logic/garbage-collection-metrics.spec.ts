import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import { createGarbageCollectionComponent } from '../../../src/logic/garbage-collection/component'
import { IGarbageCollectionComponent } from '../../../src/logic/garbage-collection/types'

const NOW = 1_800_000_000_000

type Mocks = {
  increment: jest.Mock
  observe: jest.Mock
  queryWithValues: jest.Mock
  setProperty: jest.Mock
  withWrite: jest.Mock
  unusedHashes: string[]
}

function build(mocks: Mocks, performGarbageCollection: boolean): IGarbageCollectionComponent {
  return createGarbageCollectionComponent(
    {
      metrics: {
        increment: mocks.increment,
        observe: mocks.observe,
        startTimer: jest.fn().mockReturnValue({ end: jest.fn() })
      },
      logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
      systemProperties: { get: jest.fn().mockResolvedValue(undefined), set: mocks.setProperty },
      database: { queryWithValues: mocks.queryWithValues },
      activeEntities: { clearPointers: jest.fn() },
      contentFilesRepository: {
        streamContentHashesNotBeingUsedAnymore: async function* () {
          yield* mocks.unusedHashes
        },
        findReferencedHashes: jest.fn().mockResolvedValue(new Set())
      },
      storage: { delete: jest.fn() },
      contentLocks: { withWrite: mocks.withWrite }
    } as any,
    performGarbageCollection,
    60_000,
    60_000
  )
}

function runsOf(mocks: Mocks): unknown[] {
  return mocks.increment.mock.calls.filter(([name]) => name === 'dcl_content_garbage_collection_runs_total')
}

function lastSuccessOf(mocks: Mocks): unknown[] {
  return mocks.observe.mock.calls.filter(
    ([name]) => name === 'dcl_content_garbage_collection_last_success_timestamp_seconds'
  )
}

describe('when running a garbage collection sweep', () => {
  let mocks: Mocks

  beforeEach(() => {
    mocks = {
      increment: jest.fn(),
      observe: jest.fn(),
      queryWithValues: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      setProperty: jest.fn(),
      withWrite: jest.fn(),
      unusedHashes: []
    }
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('and the sweep completes', () => {
    beforeEach(async () => {
      await build(mocks, true).performSweep()
    })

    it('should count a successful run and record when it succeeded', () => {
      expect({ runs: runsOf(mocks), lastSuccess: lastSuccessOf(mocks) }).toEqual({
        runs: [['dcl_content_garbage_collection_runs_total', { outcome: 'success' }]],
        lastSuccess: [['dcl_content_garbage_collection_last_success_timestamp_seconds', {}, NOW / 1000]]
      })
    })
  })

  describe('and deployments keep the content lock busy', () => {
    beforeEach(async () => {
      mocks.unusedHashes = ['bafkreiunused']
      mocks.withWrite.mockRejectedValueOnce(new EntityLockTimeoutError())
      await build(mocks, true).performSweep()
    })

    it('should count a deferred run without recording a success', () => {
      expect({ runs: runsOf(mocks), lastSuccess: lastSuccessOf(mocks) }).toEqual({
        runs: [['dcl_content_garbage_collection_runs_total', { outcome: 'deferred' }]],
        lastSuccess: []
      })
    })
  })

  describe('and saving the watermark fails', () => {
    let error: unknown

    beforeEach(async () => {
      mocks.setProperty.mockRejectedValueOnce(new Error('database is down'))
      error = await build(mocks, true)
        .performSweep()
        .catch((e) => e)
    })

    it('should rethrow after counting a failed run without recording a success', () => {
      expect({ error, runs: runsOf(mocks), lastSuccess: lastSuccessOf(mocks) }).toEqual({
        error: new Error('database is down'),
        runs: [['dcl_content_garbage_collection_runs_total', { outcome: 'error' }]],
        lastSuccess: []
      })
    })
  })

  describe('and the old profiles cleanup fails', () => {
    beforeEach(async () => {
      mocks.queryWithValues.mockRejectedValueOnce(new Error('database is down'))
      await build(mocks, true).performSweep()
    })

    it('should count a failed run', () => {
      expect(runsOf(mocks)).toEqual([['dcl_content_garbage_collection_runs_total', { outcome: 'error' }]])
    })
  })

  describe('and garbage collection is disabled', () => {
    beforeEach(async () => {
      await build(mocks, false).performSweep()
    })

    it('should not count a garbage collection run', () => {
      expect(runsOf(mocks)).toEqual([])
    })
  })

  describe('and garbage collection is disabled but the old profiles cleanup fails', () => {
    beforeEach(async () => {
      mocks.queryWithValues.mockRejectedValueOnce(new Error('database is down'))
      await build(mocks, false).performSweep()
    })

    it('should not count a garbage collection run', () => {
      expect(runsOf(mocks)).toEqual([])
    })
  })
})
