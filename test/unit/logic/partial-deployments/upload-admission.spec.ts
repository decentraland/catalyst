import { Authenticator } from '@dcl/crypto'
import { Readable } from 'stream'
import { EntityType } from '@dcl/schemas'
import { EnvironmentConfig } from '../../../../src/Environment'
import { createPartialDeployments } from '../../../../src/logic/partial-deployments'

const NOW = 1_800_000_000_000
// Staging hashes every uploaded file: these are the hashes of ENTITY_BYTES and CONTENT_BYTES.
const ENTITY_BYTES = Buffer.from('entity')
const CONTENT_BYTES = Buffer.from('a')
const ENTITY_ID = 'bafkreif4unuf72ukzvhewxautb2odkrlvudqrz7f5veq6phqoawlpkf3ky'
const CONTENT_HASH = 'bafkreigks6arfsq3xxfpvqrrwonchxcnu6do76auprhhfomao6c273sixm'
const DEPLOYER = '0x' + '1'.repeat(40)
const ACCOUNT_BYTES = 1_000_000

type Row = { deployerAddress: string; createdAt: Date; initialized: boolean }

describe('when a partial batch joins its upload', () => {
  let getByEntityId: jest.Mock
  let insert: jest.Mock
  let getReservationTotals: jest.Mock
  let onAdmitted: jest.Mock
  let row: Row | undefined
  let error: unknown

  function stageBatch(): Promise<unknown> {
    const config: Partial<Record<EnvironmentConfig, number>> = {
      [EnvironmentConfig.PENDING_DEPLOYMENT_TTL]: 60 * 60 * 1000,
      [EnvironmentConfig.REQUEST_TTL_BACKWARDS]: 20 * 60 * 1000,
      [EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER]: 10,
      [EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER]: ACCOUNT_BYTES,
      [EnvironmentConfig.MAX_PENDING_BYTES]: 10_000_000,
      [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: 100 * 1024 * 1024,
      [EnvironmentConfig.MAX_UPLOAD_FILE_SIZE]: 1000,
      [EnvironmentConfig.PENDING_DEPLOYMENTS_CLEANUP_INTERVAL]: 5 * 60 * 1000
    }
    const partialDeployments = createPartialDeployments({
      logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
      metrics: { increment: jest.fn(), observe: jest.fn(), startTimer: () => ({ end: jest.fn() }) },
      env: { getConfig: (key: EnvironmentConfig) => config[key] },
      storage: {
        fileInfoMultiple: jest
          .fn()
          .mockResolvedValueOnce(new Map([[CONTENT_HASH, undefined]]))
          .mockResolvedValueOnce(new Map([[CONTENT_HASH, { contentSize: 1 }]])),
        storeStream: jest.fn().mockResolvedValue(undefined)
      },
      database: { transaction: (fn: (db: unknown) => Promise<unknown>) => fn({}) },
      crypto: {
        calculateIPFSHashes: async (files: Uint8Array[]) =>
          files.map((file, index) => ({ hash: index === 0 ? ENTITY_ID : CONTENT_HASH, file }))
      },
      validator: {
        validateStagingScene: jest.fn().mockResolvedValue({ ok: true }),
        getMaxSizeInBytesPerPointer: () => 1_000_000
      },
      deployer: { isRateLimited: () => false, deployEntity: jest.fn().mockResolvedValue(NOW) },
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
        getEntityById: jest.fn().mockResolvedValue(undefined),
        hasNewerDeploymentOnPointers: jest.fn().mockResolvedValue(false)
      },
      pendingDeploymentsRepository: {
        getByEntityId,
        acquireDeployerLock: jest.fn(),
        countByDeployer: jest.fn().mockResolvedValue(0),
        acquirePointerLocks: jest.fn().mockResolvedValue(undefined),
        getLivePointerUsage: jest.fn().mockResolvedValue([]),
        insert,
        deleteUnadmitted: jest.fn().mockResolvedValue(undefined),
        addIncomingBytes: jest.fn().mockResolvedValue({ bytes: 10, endsInMs: 30_000 }),
        acquireBudgetLock: jest.fn(),
        upsertFileReceipts: jest.fn(),
        refreshReservedBytes: jest.fn(),
        getReservationTotals,
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
      requestedAt: NOW,
      onAdmitted
    })
  }

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
    row = undefined
    error = undefined
    onAdmitted = jest.fn()
    getByEntityId = jest.fn().mockImplementation(async () => row)
    insert = jest
      .fn()
      .mockImplementation(async (_db: unknown, input: { deployerAddress: string; createdAt: number }) => {
        row = { deployerAddress: input.deployerAddress, createdAt: new Date(input.createdAt), initialized: false }
      })
    getReservationTotals = jest.fn().mockResolvedValue({ scene: 1n, upload: 1n, account: 1n, total: 1n })
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('and it creates the upload within its budgets', () => {
    beforeEach(async () => {
      await stageBatch()
    })

    it('should report it created once, after reserving its bytes', () => {
      expect({
        calls: onAdmitted.mock.calls,
        afterReservation: onAdmitted.mock.invocationCallOrder[0] > getReservationTotals.mock.invocationCallOrder[0]
      }).toEqual({ calls: [[{ created: true }]], afterReservation: true })
    })
  })

  describe('and it creates the upload but its reservation fails', () => {
    beforeEach(async () => {
      getReservationTotals.mockResolvedValueOnce({
        scene: 1n,
        upload: BigInt(ACCOUNT_BYTES + 1),
        account: BigInt(ACCOUNT_BYTES + 1),
        total: BigInt(ACCOUNT_BYTES + 1)
      })
      error = await stageBatch().catch((e) => e)
    })

    it('should reject the batch without reporting it admitted', () => {
      expect({ rejected: error instanceof Error, calls: onAdmitted.mock.calls.length }).toEqual({
        rejected: true,
        calls: 0
      })
    })
  })

  describe('and it resumes the upload its signer started', () => {
    beforeEach(async () => {
      row = { deployerAddress: DEPLOYER, createdAt: new Date(NOW - 1000), initialized: false }
      await stageBatch()
    })

    it('should report it admitted but not created', () => {
      expect({ calls: onAdmitted.mock.calls, inserted: insert.mock.calls.length }).toEqual({
        calls: [[{ created: false }]],
        inserted: 0
      })
    })
  })

  describe('and a concurrent batch created the upload while this one was prepared', () => {
    beforeEach(async () => {
      const created: Row = { deployerAddress: DEPLOYER, createdAt: new Date(NOW - 1000), initialized: false }
      getByEntityId.mockReset().mockResolvedValueOnce(undefined).mockResolvedValue(created)
      await stageBatch()
    })

    it('should report it admitted but not created', () => {
      expect({ calls: onAdmitted.mock.calls, inserted: insert.mock.calls.length }).toEqual({
        calls: [[{ created: false }]],
        inserted: 0
      })
    })
  })
})
