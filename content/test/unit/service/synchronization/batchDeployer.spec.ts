import { createBatchDeployerComponent } from '../../../../src/service/synchronization/batchDeployer'
import { PROFILE_DURATION } from '../../../../src/types'
import * as deployments from '../../../../src/logic/deployments'
import * as deployRemote from '../../../../src/service/synchronization/deployRemoteEntity'

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
        const profileTimestamp = creationTime - PROFILE_DURATION + 60_000

        const components = createMockComponents()
        const batchDeployer = createBatchDeployerComponent(components, {
          ignoredTypes: new Set(),
          queueOptions: { autoStart: true, concurrency: 1, timeout: 10000 }
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
          queueOptions: { autoStart: true, concurrency: 1, timeout: 10000 }
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
  })
})
