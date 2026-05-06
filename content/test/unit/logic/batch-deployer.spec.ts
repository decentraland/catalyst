import ms from 'ms'
import { createBatchDeployerComponent } from '../../../src/logic/batch-deployer'
import * as deployments from '../../../src/logic/deployments'
import * as deployRemote from '../../../src/logic/sync-orchestrator'

function createMockComponents() {
  return {
    logs: {
      getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      })
    },
    metrics: {
      increment: jest.fn(),
      decrement: jest.fn()
    },
    fetcher: {},
    deployer: {},
    downloadQueue: {},
    staticConfigs: {
      contentStorageFolder: '/tmp'
    },
    database: {
      queryWithValues: jest.fn()
    },
    deployedEntitiesBloomFilter: {
      add: jest.fn(),
      check: jest.fn().mockReturnValue(false),
      addAllInTimeRange: jest.fn()
    },
    storage: {
      exist: jest.fn(),
      retrieve: jest.fn(),
      storeStream: jest.fn(),
      storeStreamAndCompress: jest.fn(),
      delete: jest.fn(),
      fileInfo: jest.fn(),
      fileInfoMultiple: jest.fn(),
      existMultiple: jest.fn(),
      allFileIds: jest.fn()
    },
    failedDeployments: {
      findFailedDeployment: jest.fn().mockResolvedValue(undefined),
      reportFailure: jest.fn().mockResolvedValue(undefined),
      getAllFailedDeployments: jest.fn(),
      removeFailedDeployment: jest.fn(),
      start: jest.fn()
    }
  } as any
}

describe('createBatchDeployerComponent', () => {
  let markAsDeployed: jest.Mock

  beforeEach(() => {
    markAsDeployed = jest.fn().mockResolvedValue(undefined)
    jest.spyOn(deployments, 'isEntityDeployed').mockResolvedValue(false)
    jest.spyOn(deployRemote, 'deployEntityFromRemoteServer').mockResolvedValue(undefined as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('when filtering old profiles by timestamp', () => {
    describe('and the profile becomes old after the component is created', () => {
      it('should ignore the profile using the current time, not the creation time', async () => {
        jest.useFakeTimers()

        const creationTime = Date.now()
        // Profile timestamp is just under PROFILE_DURATION ago at creation time
        // (i.e. it's still "new" when the component is created)
        const profileTimestamp = creationTime - ms('1 year') + 60_000

        const components = createMockComponents()
        const batchDeployer = createBatchDeployerComponent(components, {
          ignoredTypes: new Set(),
          queueOptions: { autoStart: true, concurrency: 1, timeout: 10000 },
          profileDuration: ms('1 year')
        })

        // Advance time so the profile is now older than PROFILE_DURATION
        jest.advanceTimersByTime(120_000)

        await batchDeployer.scheduleEntityDeployment(
          {
            entityId: 'profile-entity',
            entityTimestamp: profileTimestamp,
            entityType: 'profile',
            pointers: ['0x1'],
            authChain: [],
            markAsDeployed
          },
          ['http://server']
        )

        await batchDeployer.onIdle()

        expect(markAsDeployed).toHaveBeenCalled()
        expect(components.metrics.increment).toHaveBeenCalledWith('dcl_ignored_sync_deployments')
        expect(deployRemote.deployEntityFromRemoteServer).not.toHaveBeenCalled()
      })
    })

    describe('and the profile is still within the duration window', () => {
      it('should not ignore the profile', async () => {
        const components = createMockComponents()
        const batchDeployer = createBatchDeployerComponent(components, {
          ignoredTypes: new Set(),
          queueOptions: { autoStart: true, concurrency: 1, timeout: 10000 },
          profileDuration: ms('1 year')
        })

        const recentTimestamp = Date.now() - 60_000

        await batchDeployer.scheduleEntityDeployment(
          {
            entityId: 'recent-profile',
            entityTimestamp: recentTimestamp,
            entityType: 'profile',
            pointers: ['0x1'],
            authChain: [],
            markAsDeployed
          },
          ['http://server']
        )

        await batchDeployer.onIdle()

        expect(deployRemote.deployEntityFromRemoteServer).toHaveBeenCalled()
      })
    })

    describe('and a custom profileDuration is configured', () => {
      const customDuration = ms('7d')

      it('should ignore profiles older than the custom duration', async () => {
        const components = createMockComponents()
        const batchDeployer = createBatchDeployerComponent(components, {
          ignoredTypes: new Set(),
          queueOptions: { autoStart: true, concurrency: 1, timeout: 10000 },
          profileDuration: customDuration
        })

        const justOverBoundary = Date.now() - customDuration - 60_000

        await batchDeployer.scheduleEntityDeployment(
          {
            entityId: 'old-profile-7d',
            entityTimestamp: justOverBoundary,
            entityType: 'profile',
            pointers: ['0x1'],
            authChain: [],
            markAsDeployed
          },
          ['http://server']
        )

        await batchDeployer.onIdle()

        expect(markAsDeployed).toHaveBeenCalled()
        expect(components.metrics.increment).toHaveBeenCalledWith('dcl_ignored_sync_deployments')
        expect(deployRemote.deployEntityFromRemoteServer).not.toHaveBeenCalled()
      })

      it('should not ignore profiles within the custom duration that would be old under the default', async () => {
        const components = createMockComponents()
        const batchDeployer = createBatchDeployerComponent(components, {
          ignoredTypes: new Set(),
          queueOptions: { autoStart: true, concurrency: 1, timeout: 10000 },
          profileDuration: ms('30d')
        })

        // 14 days old: would be ignored at 7d, kept at 30d
        const fourteenDaysAgo = Date.now() - ms('14d')

        await batchDeployer.scheduleEntityDeployment(
          {
            entityId: 'profile-14d',
            entityTimestamp: fourteenDaysAgo,
            entityType: 'profile',
            pointers: ['0x1'],
            authChain: [],
            markAsDeployed
          },
          ['http://server']
        )

        await batchDeployer.onIdle()

        expect(deployRemote.deployEntityFromRemoteServer).toHaveBeenCalled()
      })
    })
  })
})
