import { Authenticator } from '@dcl/crypto'
import { Readable } from 'stream'
import { EntityType } from '@dcl/schemas'
import { EnvironmentConfig } from '../../../src/Environment'
import { createPartialDeployments } from '../../../src/logic/partial-deployments'
import { StageDeploymentResult } from '../../../src/logic/partial-deployments/types'

const NOW = 1_800_000_000_000
// Staging hashes every uploaded file: these are the hashes of ENTITY_BYTES and CONTENT_BYTES.
const ENTITY_BYTES = Buffer.from('entity')
const CONTENT_BYTES = Buffer.from('a')
const ENTITY_ID = 'bafkreif4unuf72ukzvhewxautb2odkrlvudqrz7f5veq6phqoawlpkf3ky'
const CONTENT_HASH = 'bafkreigks6arfsq3xxfpvqrrwonchxcnu6do76auprhhfomao6c273sixm'
const DEPLOYER = '0x' + '1'.repeat(40)
const PUBLISHED_AT = NOW - 1000

type Mocks = {
  increment: jest.Mock
  startTimer: jest.Mock
  stages: string[]
  getEntityById: jest.Mock
  deployEntity: jest.Mock
}

function buildMocks(): Mocks {
  const stages: string[] = []
  return {
    increment: jest.fn(),
    stages,
    // Records a stage when its timer ends, as the histogram observes it then.
    startTimer: jest.fn().mockImplementation((_name: string, labels: { stage?: string }) => ({
      end: () => labels?.stage && stages.push(labels.stage)
    })),
    getEntityById: jest.fn().mockResolvedValue(undefined),
    deployEntity: jest.fn().mockResolvedValue(NOW)
  }
}

// A single batch carrying the entity file and its only content file, which completes the upload.
function stageCompletingBatch(mocks: Mocks): Promise<StageDeploymentResult> {
  let row: { deployerAddress: string; createdAt: Date; initialized: boolean } | undefined
  const config: Partial<Record<EnvironmentConfig, number>> = {
    [EnvironmentConfig.PENDING_DEPLOYMENT_TTL]: 60 * 60 * 1000,
    [EnvironmentConfig.REQUEST_TTL_BACKWARDS]: 20 * 60 * 1000,
    [EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER]: 10,
    [EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER]: 1_000_000,
    [EnvironmentConfig.MAX_PENDING_BYTES]: 10_000_000,
    [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: 100 * 1024 * 1024,
    [EnvironmentConfig.MAX_UPLOAD_FILE_SIZE]: 1000,
    [EnvironmentConfig.PENDING_DEPLOYMENTS_CLEANUP_INTERVAL]: 5 * 60 * 1000
  }
  const tx = {}
  const partialDeployments = createPartialDeployments({
    logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
    metrics: { increment: mocks.increment, observe: jest.fn(), startTimer: mocks.startTimer },
    env: { getConfig: (key: EnvironmentConfig) => config[key] },
    storage: {
      fileInfoMultiple: jest
        .fn()
        .mockResolvedValueOnce(new Map([[CONTENT_HASH, undefined]]))
        .mockResolvedValueOnce(new Map([[CONTENT_HASH, { contentSize: 1 }]])),
      storeStream: jest.fn().mockResolvedValue(undefined)
    },
    database: { transaction: (fn: (db: unknown) => Promise<unknown>) => fn(tx) },
    crypto: {
      calculateIPFSHashes: async (files: Uint8Array[]) =>
        files.map((file, index) => ({ hash: index === 0 ? ENTITY_ID : CONTENT_HASH, file }))
    },
    validator: {
      validateStagingScene: jest.fn().mockResolvedValue({ ok: true }),
      getMaxSizeInBytesPerPointer: () => 1_000_000
    },
    deployer: { isRateLimited: () => false, deployEntity: mocks.deployEntity },
    entities: {
      parse: () => ({
        id: ENTITY_ID,
        type: EntityType.SCENE,
        pointers: ['0,0'],
        timestamp: NOW,
        content: [{ file: 'a.txt', hash: CONTENT_HASH }]
      })
    },
    deploymentsRepository: {
      getEntityById: mocks.getEntityById,
      hasNewerDeploymentOnPointers: jest.fn().mockResolvedValue(false)
    },
    pendingDeploymentsRepository: {
      getByEntityId: async () => row,
      acquireDeployerLock: jest.fn(),
      countByDeployer: jest.fn().mockResolvedValue(0),
      acquirePointerLocks: jest.fn().mockResolvedValue(undefined),
      getLivePointerUsage: jest.fn().mockResolvedValue([]),
      insert: async (_db: unknown, input: { deployerAddress: string; createdAt: number }) => {
        row = { deployerAddress: input.deployerAddress, createdAt: new Date(input.createdAt), initialized: false }
      },
      addIncomingBytes: jest.fn().mockResolvedValue({ bytes: 10, endsInMs: 30_000 }),
      acquireBudgetLock: jest.fn(),
      upsertFileReceipts: jest.fn(),
      refreshReservedBytes: jest.fn(),
      getReservationTotals: jest.fn().mockResolvedValue({ scene: 1n, upload: 1n, account: 1n, total: 1n }),
      markInitializedIfLive: jest.fn().mockResolvedValue(true),
      markStored: jest.fn(),
      countBatch: jest.fn().mockResolvedValue(1),
      getStoredFiles: jest.fn().mockResolvedValue(new Map([[CONTENT_HASH, 1]])),
      deleteByEntityId: jest.fn()
    },
    contentFilesRepository: { findPublishedHashes: jest.fn().mockResolvedValue(new Set()) },
    contentLocks: { withRead: (fn: () => Promise<unknown>) => fn() }
  } as any)
  return partialDeployments.stageDeployment({
    entityId: ENTITY_ID,
    authChain: Authenticator.createSimpleAuthChain(ENTITY_ID, DEPLOYER, '0x' + 'a'.repeat(130)),
    files: new Map([
      [ENTITY_ID, { size: ENTITY_BYTES.length, openStream: () => Readable.from([ENTITY_BYTES]) }],
      [CONTENT_HASH, { size: CONTENT_BYTES.length, openStream: () => Readable.from([CONTENT_BYTES]) }]
    ]),
    entityFile: ENTITY_BYTES,
    requestedAt: NOW
  })
}

function completionsOf(mocks: Mocks): number {
  return mocks.increment.mock.calls.filter(([name]) => name === 'dcl_partial_uploads_completed_total').length
}

describe('when a batch completes a partial upload', () => {
  let mocks: Mocks
  let result: StageDeploymentResult

  beforeEach(() => {
    mocks = buildMocks()
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('and it publishes the entity', () => {
    beforeEach(async () => {
      result = await stageCompletingBatch(mocks)
    })

    it('should report it deployed and count one completed upload', () => {
      expect({ result, completions: completionsOf(mocks) }).toEqual({
        result: { kind: 'deployed', creationTimestamp: NOW },
        completions: 1
      })
    })

    it('should time every stage of the batch and its finalize once, in order', () => {
      expect(mocks.stages).toEqual([
        'hash',
        'validate',
        'lock_wait',
        'inventory',
        'accounting',
        'store',
        'progress',
        'finalize_verify',
        'finalize_deploy'
      ])
    })
  })

  describe('and a concurrent request published it first', () => {
    beforeEach(async () => {
      mocks.deployEntity.mockResolvedValueOnce({ errors: ['duplicate key'] })
      mocks.getEntityById
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ localTimestamp: PUBLISHED_AT })
      result = await stageCompletingBatch(mocks)
    })

    it('should report a replay without counting a completed upload', () => {
      expect({ result, completions: completionsOf(mocks) }).toEqual({
        result: { kind: 'replayed', creationTimestamp: PUBLISHED_AT },
        completions: 0
      })
    })
  })

  describe('and its pointers were being deployed by the request that then published it', () => {
    beforeEach(async () => {
      mocks.deployEntity.mockResolvedValueOnce({
        kind: 'pointer-conflict',
        errors: ['The pointers are being deployed.']
      })
      mocks.getEntityById
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ localTimestamp: PUBLISHED_AT })
      // Waits out one real 300 ms conflict back-off.
      result = await stageCompletingBatch(mocks)
    })

    it('should report a replay without deploying again or counting a completed upload', () => {
      expect({ result, completions: completionsOf(mocks), deploys: mocks.deployEntity.mock.calls.length }).toEqual({
        result: { kind: 'replayed', creationTimestamp: PUBLISHED_AT },
        completions: 0,
        deploys: 1
      })
    })
  })
})
