import { Authenticator } from '@dcl/crypto'
import { hashV1 } from '@dcl/hashing'
import { Readable } from 'stream'
import { UploadBudgetExceededError } from '../../../../src/adapters/upload-budget'
import { EnvironmentConfig } from '../../../../src/Environment'
import {
  createPartialDeployments,
  InvalidPartialDeploymentError,
  IPartialDeployments,
  StagedFile
} from '../../../../src/logic/partial-deployments'

const DEPLOYER = '0x' + '1'.repeat(40)
const ENTITY_CHUNKS = ['{"entity":', 'true}']
const ENTITY_BYTES = ENTITY_CHUNKS.join('').length

describe('when staging a partial batch', () => {
  let entityId: string
  let authChain: ReturnType<typeof Authenticator.createSimpleAuthChain>
  let lease: { resize: jest.Mock; release: jest.Mock }
  let deploymentMemoryBudget: { capacityBytes: number; acquire: jest.Mock }
  let retrieve: jest.Mock
  let parse: jest.Mock
  let validateStagingScene: jest.Mock
  let releasedWhileValidating: number | undefined
  let partialDeployments: IPartialDeployments

  beforeEach(async () => {
    entityId = await hashV1(Buffer.from(ENTITY_CHUNKS.join('')))
    authChain = Authenticator.createSimpleAuthChain(entityId, DEPLOYER, '0x' + 'a'.repeat(130))
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    deploymentMemoryBudget = { capacityBytes: 1024, acquire: jest.fn().mockReturnValue(lease) }
    retrieve = jest.fn().mockResolvedValue({
      asStream: async () => Readable.from(ENTITY_CHUNKS.map((chunk) => Buffer.from(chunk)))
    })
    parse = jest.fn().mockReturnValue({
      id: entityId,
      type: 'scene',
      pointers: ['0,0'],
      timestamp: Date.now(),
      content: []
    })
    releasedWhileValidating = undefined
    // Stops the batch once the entity file is parsed, recording whether its memory share is still held.
    validateStagingScene = jest.fn(async () => {
      releasedWhileValidating = lease.release.mock.calls.length
      return { ok: false, errors: ['stop here'] }
    })
    const config: Record<string, number> = {
      [EnvironmentConfig.PENDING_DEPLOYMENT_TTL]: 60 * 60 * 1000,
      [EnvironmentConfig.REQUEST_TTL_BACKWARDS]: 60 * 60 * 1000,
      [EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER]: 10,
      [EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER]: 1e9,
      [EnvironmentConfig.MAX_PENDING_BYTES]: 1e9,
      [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: 1e9,
      [EnvironmentConfig.MAX_UPLOAD_FILE_SIZE]: 1e6
    }
    partialDeployments = createPartialDeployments({
      logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
      metrics: { increment: jest.fn(), observe: jest.fn() },
      env: { getConfig: (key: number) => config[key] },
      crypto: { validateSignature: jest.fn().mockResolvedValue({ ok: true }) },
      storage: { retrieve },
      database: {},
      validator: { validateStagingScene },
      deployer: {},
      entities: { parse },
      deploymentsRepository: { getEntityById: jest.fn().mockResolvedValue(undefined) },
      pendingDeploymentsRepository: {
        getByEntityId: jest.fn().mockResolvedValue({ deployerAddress: DEPLOYER, createdAt: new Date() })
      },
      contentFilesRepository: {},
      contentLocks: {},
      deploymentMemoryBudget
    } as any)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and it carries its entity file', () => {
    let error: unknown
    let opened: number

    beforeEach(async () => {
      opened = 0
      const entityFile: StagedFile = {
        size: ENTITY_BYTES,
        openStream: () => {
          opened++
          return Readable.from([Buffer.from(ENTITY_CHUNKS.join(''))])
        }
      }
      error = await partialDeployments
        .stageDeployment({
          entityId,
          authChain,
          files: new Map([[entityId, entityFile]]),
          entityFile: Buffer.from(ENTITY_CHUNKS.join('')),
          requestedAt: Date.now()
        })
        .catch((e) => e)
    })

    it('should parse the bytes it was handed, streaming the entity file only to hash it and taking no memory share', () => {
      expect({
        error,
        parsed: parse.mock.calls.map(([bytes]) => Buffer.from(bytes).toString()),
        opened,
        retrieved: retrieve.mock.calls.length,
        reserved: deploymentMemoryBudget.acquire.mock.calls.length
      }).toEqual({
        error: new InvalidPartialDeploymentError(['stop here']),
        parsed: [ENTITY_CHUNKS.join('')],
        opened: 1,
        retrieved: 0,
        reserved: 0
      })
    })
  })

  describe('and it resumes an upload without its entity file', () => {
    let error: unknown

    beforeEach(async () => {
      error = await partialDeployments
        .stageDeployment({ entityId, authChain, files: new Map(), requestedAt: Date.now() })
        .catch((e) => e)
    })

    it('should read the entity file back under a memory share grown with each chunk and held until the batch settles', () => {
      expect({
        error,
        parsed: parse.mock.calls.map(([bytes]) => Buffer.from(bytes).toString()),
        reserved: deploymentMemoryBudget.acquire.mock.calls,
        resized: lease.resize.mock.calls,
        releasedWhileValidating,
        released: lease.release.mock.calls.length
      }).toEqual({
        error: new InvalidPartialDeploymentError(['stop here']),
        parsed: [ENTITY_CHUNKS.join('')],
        reserved: [[0]],
        resized: [[ENTITY_CHUNKS[0].length], [ENTITY_BYTES]],
        releasedWhileValidating: 0,
        released: 1
      })
    })
  })

  describe('and it resumes an upload while the memory budget has no room for its entity file', () => {
    let error: unknown

    beforeEach(async () => {
      lease.resize.mockReturnValue(false)
      error = await partialDeployments
        .stageDeployment({ entityId, authChain, files: new Map(), requestedAt: Date.now() })
        .catch((e) => e)
    })

    it('should reject with an UploadBudgetExceededError before parsing it and release the memory share', () => {
      expect({ error, parsed: parse.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        error: new UploadBudgetExceededError(),
        parsed: 0,
        released: 1
      })
    })
  })

  describe('and it resumes an upload whose stored entity file is larger than the memory budget can ever hold', () => {
    let error: unknown

    beforeEach(async () => {
      deploymentMemoryBudget.capacityBytes = ENTITY_BYTES - 1
      error = await partialDeployments
        .stageDeployment({ entityId, authChain, files: new Map(), requestedAt: Date.now() })
        .catch((e) => e)
    })

    it('should reject it as too large rather than as a retryable budget rejection', () => {
      expect({ error, parsed: parse.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        error: new InvalidPartialDeploymentError([
          `The stored entity file is too large (over ${ENTITY_BYTES - 1} bytes).`
        ]),
        parsed: 0,
        released: 1
      })
    })
  })
})
