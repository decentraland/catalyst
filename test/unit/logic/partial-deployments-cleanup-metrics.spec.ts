import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import { EnvironmentConfig } from '../../../src/Environment'
import { createPartialDeployments } from '../../../src/logic/partial-deployments'
import { ExpiredCleanupSummary, IPartialDeployments } from '../../../src/logic/partial-deployments/types'

const NOW = 1_800_000_000_000
const MAX_PENDING_BYTES = 5000
const MAX_UPLOAD_FILE_SIZE = 1000
// Fits the entity file (up to 10 MiB) plus one maximum-size file.
const MIN_BYTES_PER_MINUTE = MAX_UPLOAD_FILE_SIZE + 10 * 1024 * 1024

// listExpired's page size and pages per cleanup run.
const PAGE_SIZE = 100
const PAGES_PER_RUN = 5

type Mocks = {
  metrics: { increment: jest.Mock; observe: jest.Mock; startTimer: jest.Mock }
  endTimer: jest.Mock
  logError: jest.Mock
  withWrite: jest.Mock
  storageDelete: jest.Mock
  listExpired: jest.Mock
  getStagedKeys: jest.Mock
  deleteExpiredByEntityId: jest.Mock
  deleteElapsedRateWindows: jest.Mock
  getStagingTotals: jest.Mock
}

function buildMocks(): Mocks {
  const endTimer = jest.fn()
  return {
    metrics: { increment: jest.fn(), observe: jest.fn(), startTimer: jest.fn().mockReturnValue({ end: endTimer }) },
    endTimer,
    logError: jest.fn(),
    withWrite: jest.fn(),
    storageDelete: jest.fn().mockResolvedValue(undefined),
    listExpired: jest.fn(),
    getStagedKeys: jest.fn().mockResolvedValue(['bafkreia']),
    deleteExpiredByEntityId: jest.fn(),
    deleteElapsedRateWindows: jest.fn(),
    getStagingTotals: jest.fn().mockResolvedValue({ total: 300, expired: 100, liveUploads: 2, expiredUploads: 1 })
  }
}

function expiredUploads(prefix: string, count: number): { entityId: string; createdAt: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    entityId: `${prefix}${String(index).padStart(3, '0')}`,
    createdAt: '2026-10-01 00:00:00+00'
  }))
}

function build(mocks: Mocks, overrides: Partial<Record<EnvironmentConfig, number>> = {}): IPartialDeployments {
  const config: Partial<Record<EnvironmentConfig, number>> = {
    [EnvironmentConfig.PENDING_DEPLOYMENT_TTL]: 60 * 60 * 1000,
    [EnvironmentConfig.REQUEST_TTL_BACKWARDS]: 20 * 60 * 1000,
    [EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER]: 10,
    [EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER]: 1000,
    [EnvironmentConfig.MAX_PENDING_BYTES]: MAX_PENDING_BYTES,
    [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: MIN_BYTES_PER_MINUTE,
    [EnvironmentConfig.MAX_UPLOAD_FILE_SIZE]: MAX_UPLOAD_FILE_SIZE,
    [EnvironmentConfig.PENDING_DEPLOYMENTS_CLEANUP_INTERVAL]: 5 * 60 * 1000,
    ...overrides
  }
  return createPartialDeployments({
    logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: mocks.logError, debug: jest.fn() }) },
    metrics: mocks.metrics,
    env: { getConfig: (key: EnvironmentConfig) => config[key] },
    storage: { delete: mocks.storageDelete },
    contentFilesRepository: { findReferencedHashes: jest.fn().mockResolvedValue(new Set()) },
    contentLocks: { withWrite: mocks.withWrite },
    pendingDeploymentsRepository: {
      listExpired: mocks.listExpired,
      getStagedKeys: mocks.getStagedKeys,
      deleteExpiredByEntityId: mocks.deleteExpiredByEntityId,
      deleteElapsedRateWindows: mocks.deleteElapsedRateWindows,
      getStagingTotals: mocks.getStagingTotals
    }
  } as any)
}

function runsOf(mocks: Mocks): unknown[] {
  return mocks.metrics.increment.mock.calls.filter(([name]) => name === 'dcl_partial_upload_cleanup_runs_total')
}

function failuresOf(mocks: Mocks): unknown[] {
  return mocks.metrics.increment.mock.calls.filter(([name]) => name === 'dcl_partial_upload_cleanup_failures_total')
}

function reclaimedOf(mocks: Mocks): string[] {
  return mocks.deleteExpiredByEntityId.mock.calls.map(([, entityId]) => entityId)
}

// Whether the run dropped elapsed rate windows and reported the reserved-bytes gauges.
function housekeepingOf(mocks: Mocks): { rateWindows: number; reserved: unknown[]; backlog: unknown[] } {
  return {
    rateWindows: mocks.deleteElapsedRateWindows.mock.calls.length,
    reserved: mocks.metrics.observe.mock.calls.filter(([name]) => name === 'dcl_partial_upload_reserved_bytes'),
    backlog: mocks.metrics.observe.mock.calls.filter(([name]) => name === 'dcl_partial_upload_cleanup_backlog_bytes')
  }
}

const HOUSEKEPT = {
  rateWindows: 1,
  reserved: [['dcl_partial_upload_reserved_bytes', {}, 300]],
  backlog: [['dcl_partial_upload_cleanup_backlog_bytes', {}, 100]]
}

function lastSuccessOf(mocks: Mocks): unknown[] {
  return mocks.metrics.observe.mock.calls.filter(
    ([name]) => name === 'dcl_partial_upload_cleanup_last_success_timestamp_seconds'
  )
}

describe('when creating the partial deployments component', () => {
  let mocks: Mocks

  beforeEach(() => {
    mocks = buildMocks()
    build(mocks)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should report the server-wide staging cap', () => {
    expect(mocks.metrics.observe).toHaveBeenCalledWith('dcl_partial_upload_capacity_bytes', {}, MAX_PENDING_BYTES)
  })
})

describe('when creating the partial deployments component with a byte rate below one entity file plus one maximum-size file', () => {
  let creating: () => IPartialDeployments

  beforeEach(() => {
    const mocks = buildMocks()
    creating = () => build(mocks, { [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: MIN_BYTES_PER_MINUTE - 1 })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should fail startup naming the least byte rate that fits such a batch', () => {
    expect(creating).toThrow(
      `MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE (${
        MIN_BYTES_PER_MINUTE - 1
      }) must fit a batch of the entity file (up to 10485760 bytes) and one MAX_UPLOAD_FILE_SIZE file: at least ${MIN_BYTES_PER_MINUTE}.`
    )
  })
})

describe('when cleaning up expired partial uploads', () => {
  let mocks: Mocks
  let partialDeployments: IPartialDeployments
  let summary: ExpiredCleanupSummary

  beforeEach(() => {
    mocks = buildMocks()
    partialDeployments = build(mocks)
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
    mocks.withWrite.mockImplementation((operation: () => Promise<unknown>) => operation())
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('and every expired upload is reclaimed', () => {
    beforeEach(async () => {
      mocks.listExpired.mockResolvedValueOnce(expiredUploads('bafkreientity', 1))
      summary = await partialDeployments.cleanupExpired()
    })

    it('should report a clean run that reclaimed the upload', () => {
      expect(summary).toEqual({ removed: 1, failed: 0, outcome: 'success' })
    })

    it('should count a successful run, time it and record when it succeeded', () => {
      expect({
        runs: runsOf(mocks),
        lastSuccess: lastSuccessOf(mocks),
        timed: mocks.endTimer.mock.calls.length
      }).toEqual({
        runs: [['dcl_partial_upload_cleanup_runs_total', { outcome: 'success' }]],
        lastSuccess: [['dcl_partial_upload_cleanup_last_success_timestamp_seconds', {}, NOW / 1000]],
        timed: 1
      })
    })

    it('should report the live and expired uploads left in the database', () => {
      expect(mocks.metrics.observe.mock.calls.filter(([name]) => name === 'dcl_partial_uploads_pending')).toEqual([
        ['dcl_partial_uploads_pending', { state: 'live' }, 2],
        ['dcl_partial_uploads_pending', { state: 'expired' }, 1]
      ])
    })

    it('should count the reclaimed upload', () => {
      expect(mocks.metrics.increment).toHaveBeenCalledWith('dcl_pending_deployments_expired_total', {}, 1)
    })
  })

  describe('and storage fails to delete the first expired upload content', () => {
    beforeEach(async () => {
      mocks.listExpired.mockResolvedValueOnce(expiredUploads('bafkreientity', 2))
      mocks.storageDelete.mockRejectedValueOnce(new Error('storage unavailable'))
      summary = await partialDeployments.cleanupExpired()
    })

    it('should go on to reclaim the second upload and report the failure', () => {
      expect({ summary, reclaimed: reclaimedOf(mocks) }).toEqual({
        summary: { removed: 1, failed: 1, outcome: 'error' },
        reclaimed: ['bafkreientity001']
      })
    })

    it('should count a failed run without recording a success', () => {
      expect({ runs: runsOf(mocks), lastSuccess: lastSuccessOf(mocks) }).toEqual({
        runs: [['dcl_partial_upload_cleanup_runs_total', { outcome: 'error' }]],
        lastSuccess: []
      })
    })

    it('should count the failure as a storage one', () => {
      expect(failuresOf(mocks)).toEqual([['dcl_partial_upload_cleanup_failures_total', { reason: 'storage' }]])
    })

    it('should log the failing upload and the storage error', () => {
      expect(mocks.logError).toHaveBeenCalledWith(expect.any(String), {
        entityId: 'bafkreientity000',
        reason: 'storage',
        error: 'Failed to delete staged content of bafkreientity000: storage unavailable'
      })
    })

    it('should still drop elapsed rate windows and report the staging gauges', () => {
      expect(housekeepingOf(mocks)).toEqual(HOUSEKEPT)
    })
  })

  describe('and a database query fails for the first expired upload', () => {
    beforeEach(async () => {
      mocks.listExpired.mockResolvedValueOnce(expiredUploads('bafkreientity', 2))
      mocks.getStagedKeys.mockRejectedValueOnce(new Error('database is down'))
      summary = await partialDeployments.cleanupExpired()
    })

    it('should go on to reclaim the second upload and count the failure as a database one', () => {
      expect({ summary, failures: failuresOf(mocks) }).toEqual({
        summary: { removed: 1, failed: 1, outcome: 'error' },
        failures: [['dcl_partial_upload_cleanup_failures_total', { reason: 'database' }]]
      })
    })
  })

  describe('and deployments keep the content lock busy', () => {
    beforeEach(async () => {
      mocks.listExpired.mockResolvedValueOnce(expiredUploads('bafkreientity', 2))
      mocks.withWrite.mockRejectedValueOnce(new EntityLockTimeoutError())
      summary = await partialDeployments.cleanupExpired()
    })

    it('should stop at the busy upload and report a deferred run', () => {
      expect({ summary, reclaimed: reclaimedOf(mocks), listed: mocks.listExpired.mock.calls.length }).toEqual({
        summary: { removed: 0, failed: 0, outcome: 'deferred' },
        reclaimed: [],
        listed: 1
      })
    })

    it('should count a deferred run without recording a success', () => {
      expect({ runs: runsOf(mocks), lastSuccess: lastSuccessOf(mocks) }).toEqual({
        runs: [['dcl_partial_upload_cleanup_runs_total', { outcome: 'deferred' }]],
        lastSuccess: []
      })
    })

    it('should still drop elapsed rate windows and report the staging gauges', () => {
      expect(housekeepingOf(mocks)).toEqual(HOUSEKEPT)
    })
  })

  describe('and an upload fails before deployments keep the content lock busy', () => {
    beforeEach(async () => {
      mocks.listExpired.mockResolvedValueOnce(expiredUploads('bafkreientity', 2))
      mocks.storageDelete.mockRejectedValueOnce(new Error('storage unavailable'))
      mocks.withWrite
        .mockImplementationOnce((operation: () => Promise<unknown>) => operation())
        .mockRejectedValueOnce(new EntityLockTimeoutError())
      summary = await partialDeployments.cleanupExpired()
    })

    it('should report an error run rather than a deferred one', () => {
      expect(summary).toEqual({ removed: 0, failed: 1, outcome: 'error' })
    })
  })

  describe('and every upload of the first page fails', () => {
    let firstPage: { entityId: string; createdAt: string }[]

    beforeEach(async () => {
      firstPage = expiredUploads('bafkreifailing', PAGE_SIZE)
      mocks.listExpired.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(expiredUploads('bafkreilater', 1))
      mocks.getStagedKeys.mockImplementation(async (_db: unknown, entityId: string) => {
        if (entityId.startsWith('bafkreifailing')) {
          throw new Error('database is down')
        }
        return ['bafkreia']
      })
      summary = await partialDeployments.cleanupExpired()
    })

    it('should list the next page after the last failing upload and reclaim it', () => {
      expect({
        summary,
        reclaimed: reclaimedOf(mocks),
        after: mocks.listExpired.mock.calls.map(([, , , after]) => after)
      }).toEqual({
        summary: { removed: 1, failed: PAGE_SIZE, outcome: 'error' },
        reclaimed: ['bafkreilater000'],
        after: [undefined, firstPage[PAGE_SIZE - 1]]
      })
    })
  })

  describe('and every listed page is full of failing uploads', () => {
    beforeEach(async () => {
      mocks.listExpired.mockImplementation(async () => expiredUploads('bafkreifailing', PAGE_SIZE))
      mocks.getStagedKeys.mockRejectedValue(new Error('database is down'))
      summary = await partialDeployments.cleanupExpired()
    })

    it('should stop after the per-run page cap', () => {
      expect({ summary, listed: mocks.listExpired.mock.calls.length }).toEqual({
        summary: { removed: 0, failed: PAGE_SIZE * PAGES_PER_RUN, outcome: 'error' },
        listed: PAGES_PER_RUN
      })
    })
  })

  describe('and listing the expired uploads fails', () => {
    let error: unknown

    beforeEach(async () => {
      mocks.listExpired.mockRejectedValueOnce(new Error('database is down'))
      error = await partialDeployments.cleanupExpired().catch((e) => e)
    })

    it('should rethrow after counting a failed, timed run without recording a success', () => {
      expect({
        error,
        runs: runsOf(mocks),
        lastSuccess: lastSuccessOf(mocks),
        timed: mocks.endTimer.mock.calls.length
      }).toEqual({
        error: new Error('database is down'),
        runs: [['dcl_partial_upload_cleanup_runs_total', { outcome: 'error' }]],
        lastSuccess: [],
        timed: 1
      })
    })

    it('should still drop elapsed rate windows and report the staging gauges', () => {
      expect(housekeepingOf(mocks)).toEqual(HOUSEKEPT)
    })
  })
})
