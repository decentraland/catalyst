import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
import { EnvironmentConfig } from '../../../src/Environment'
import { createPartialDeployments } from '../../../src/logic/partial-deployments'
import { IPartialDeployments } from '../../../src/logic/partial-deployments/types'

const NOW = 1_800_000_000_000
const MAX_PENDING_BYTES = 5000

type Mocks = {
  metrics: { increment: jest.Mock; observe: jest.Mock; startTimer: jest.Mock }
  endTimer: jest.Mock
  withWrite: jest.Mock
  listExpired: jest.Mock
  getStagingTotals: jest.Mock
}

function buildMocks(): Mocks {
  const endTimer = jest.fn()
  return {
    metrics: { increment: jest.fn(), observe: jest.fn(), startTimer: jest.fn().mockReturnValue({ end: endTimer }) },
    endTimer,
    withWrite: jest.fn(),
    listExpired: jest.fn(),
    getStagingTotals: jest.fn().mockResolvedValue({ total: 300, expired: 100, liveUploads: 2, expiredUploads: 1 })
  }
}

function build(mocks: Mocks): IPartialDeployments {
  const config: Partial<Record<EnvironmentConfig, number>> = {
    [EnvironmentConfig.PENDING_DEPLOYMENT_TTL]: 60 * 60 * 1000,
    [EnvironmentConfig.REQUEST_TTL_BACKWARDS]: 20 * 60 * 1000,
    [EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER]: 10,
    [EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER]: 1000,
    [EnvironmentConfig.MAX_PENDING_BYTES]: MAX_PENDING_BYTES,
    [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: 1000,
    [EnvironmentConfig.PENDING_DEPLOYMENTS_CLEANUP_INTERVAL]: 5 * 60 * 1000
  }
  return createPartialDeployments({
    logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
    metrics: mocks.metrics,
    env: { getConfig: (key: EnvironmentConfig) => config[key] },
    storage: { delete: jest.fn() },
    contentFilesRepository: { findReferencedHashes: jest.fn().mockResolvedValue(new Set()) },
    contentLocks: { withWrite: mocks.withWrite },
    pendingDeploymentsRepository: {
      listExpired: mocks.listExpired,
      getStagedKeys: jest.fn().mockResolvedValue(['bafkreia']),
      deleteExpiredByEntityId: jest.fn(),
      deleteElapsedRateWindows: jest.fn(),
      getStagingTotals: mocks.getStagingTotals
    }
  } as any)
}

function runsOf(mocks: Mocks): unknown[] {
  return mocks.metrics.increment.mock.calls.filter(([name]) => name === 'dcl_partial_upload_cleanup_runs_total')
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

describe('when cleaning up expired partial uploads', () => {
  let mocks: Mocks
  let partialDeployments: IPartialDeployments

  beforeEach(() => {
    mocks = buildMocks()
    partialDeployments = build(mocks)
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('and every expired upload is reclaimed', () => {
    beforeEach(async () => {
      mocks.listExpired.mockResolvedValueOnce(['bafkreientity'])
      mocks.withWrite.mockImplementation((operation: () => Promise<unknown>) => operation())
      await partialDeployments.cleanupExpired()
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

  describe('and deployments keep the content lock busy', () => {
    beforeEach(async () => {
      mocks.listExpired.mockResolvedValueOnce(['bafkreientity'])
      mocks.withWrite.mockRejectedValueOnce(new EntityLockTimeoutError())
      await partialDeployments.cleanupExpired()
    })

    it('should count a deferred run without recording a success', () => {
      expect({ runs: runsOf(mocks), lastSuccess: lastSuccessOf(mocks) }).toEqual({
        runs: [['dcl_partial_upload_cleanup_runs_total', { outcome: 'deferred' }]],
        lastSuccess: []
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
  })
})
