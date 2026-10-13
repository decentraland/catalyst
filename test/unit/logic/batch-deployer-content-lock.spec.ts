import { Readable } from 'stream'
import { createBatchDeployerComponent } from '../../../src/logic/batch-deployer'
import { DeploymentContext } from '../../../src/deployment-types'

jest.mock('@dcl/snapshots-fetcher', () => ({
  ...jest.requireActual('@dcl/snapshots-fetcher'),
  downloadEntityAndContentFiles: jest.fn().mockResolvedValue(undefined)
}))

describe('when a synced entity is deployed from a remote server', () => {
  let lockedEntityId: string | undefined
  let deployedInsideLock: boolean

  beforeEach(async () => {
    let insideLock = false
    const deployEntity = jest.fn(async () => {
      deployedInsideLock = insideLock
      return 123
    })
    const withRead = jest.fn(async (operation: () => Promise<unknown>, entityId: string) => {
      lockedEntityId = entityId
      insideLock = true
      try {
        return await operation()
      } finally {
        insideLock = false
      }
    })
    const batchDeployer = createBatchDeployerComponent(
      {
        logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
        metrics: { increment: jest.fn(), decrement: jest.fn(), startTimer: () => ({ end: jest.fn() }) },
        fetcher: {},
        deployer: { deployEntity },
        downloadQueue: {},
        staticConfigs: { tmpDownloadFolder: '/tmp' },
        database: {},
        deployedEntitiesBloomFilter: {},
        storage: {
          retrieve: jest.fn().mockResolvedValue({ asStream: async () => Readable.from([Buffer.from('{}')]) })
        },
        failedDeployments: {},
        deploymentsRepository: {},
        contentLocks: { withRead }
      } as any,
      {
        ignoredTypes: new Set(),
        queueOptions: { autoStart: false, concurrency: 1, timeout: 1000 },
        profileDuration: 1000
      }
    )
    await batchDeployer.deployEntityFromRemoteServer(
      'synced-entity',
      'scene',
      [],
      ['https://peer'],
      DeploymentContext.SYNCED
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should publish it under the content lock scoped to the entity', () => {
    expect({ lockedEntityId, deployedInsideLock }).toEqual({
      lockedEntityId: 'synced-entity',
      deployedInsideLock: true
    })
  })
})
