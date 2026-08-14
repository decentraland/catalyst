import ms from 'ms'
import { createBatchDeployerComponent } from '../../../src/logic/batch-deployer'
import * as deployments from '../../../src/logic/deployments'
import { DeploymentContext } from '../../../src/deployment-types'

const snapshotsFetcher = jest.requireActual<typeof import('@dcl/snapshots-fetcher')>('@dcl/snapshots-fetcher')

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
      decrement: jest.fn(),
      startTimer: jest.fn().mockReturnValue({ end: jest.fn() })
    },
    fetcher: {},
    deployer: {
      deployEntity: jest.fn().mockResolvedValue(0)
    },
    downloadQueue: {},
    staticConfigs: {
      contentStorageFolder: '/tmp',
      tmpDownloadFolder: '/tmp'
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
        const deploySpy = jest.spyOn(batchDeployer, 'deployEntityFromRemoteServer').mockResolvedValue(undefined)

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
        expect(deploySpy).not.toHaveBeenCalled()
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
        const deploySpy = jest.spyOn(batchDeployer, 'deployEntityFromRemoteServer').mockResolvedValue(undefined)

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

        expect(deploySpy).toHaveBeenCalled()
      })
    })
  })

  describe('when verified entity bytes are supplied by the fetcher', () => {
    let components: ReturnType<typeof createMockComponents>
    let batchDeployer: ReturnType<typeof createBatchDeployerComponent>
    let verifiedEntityFile: Uint8Array

    beforeEach(() => {
      components = createMockComponents()
      batchDeployer = createBatchDeployerComponent(components, {
        ignoredTypes: new Set(),
        queueOptions: { autoStart: true, concurrency: 1, timeout: 10000 },
        contentDownloadConcurrency: 1,
        profileDuration: ms('1 year')
      })
      verifiedEntityFile = Buffer.from('{"type":"scene"}')
    })

    it('should deploy without retrieving the entity from storage again', async () => {
      await batchDeployer.deployDownloadedEntity(
        'entity-id',
        'scene',
        { authChain: [] },
        DeploymentContext.SYNCED,
        verifiedEntityFile
      )

      expect(components.storage.retrieve).not.toHaveBeenCalled()
    })

    it('should pass the exact verified bytes to the entity deployer', async () => {
      await batchDeployer.deployDownloadedEntity(
        'entity-id',
        'scene',
        { authChain: [] },
        DeploymentContext.SYNCED,
        verifiedEntityFile
      )

      expect(components.deployer.deployEntity).toHaveBeenCalledWith(
        [verifiedEntityFile],
        'entity-id',
        { authChain: [] },
        DeploymentContext.SYNCED
      )
    })
  })

  describe('when the component stops with owned queues', () => {
    let stopOrder: string[]
    let batchDeployer: ReturnType<typeof createBatchDeployerComponent>

    beforeEach(() => {
      stopOrder = []
      const deploymentQueue = {
        stop: jest.fn(async () => {
          stopOrder.push('deployments')
        })
      }
      const contentQueue = {
        stop: jest.fn(async () => {
          stopOrder.push('content')
        })
      }
      jest
        .spyOn(snapshotsFetcher, 'createJobQueue')
        .mockReturnValueOnce(deploymentQueue as any)
        .mockReturnValueOnce(contentQueue as any)
      batchDeployer = createBatchDeployerComponent(createMockComponents(), {
        ignoredTypes: new Set(),
        queueOptions: { autoStart: true, concurrency: 1 },
        contentDownloadConcurrency: 1,
        profileDuration: ms('1 year')
      })
    })

    it('should terminate deployment work before terminating its content queue', async () => {
      await batchDeployer.stop?.()

      expect(stopOrder).toEqual(['deployments', 'content'])
    })
  })
})
