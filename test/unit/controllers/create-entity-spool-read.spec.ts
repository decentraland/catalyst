import { Authenticator } from '@dcl/crypto'
import fsPromises from 'fs/promises'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { createEntity } from '../../../src/controllers/handlers/create-entity-handler'
import { createErrorHandler } from '../../../src/controllers/middlewares'

type Context = Parameters<typeof createEntity>[0]
type HttpResponse = { status: number; headers?: Record<string, string> }

const ENTITY_ID = 'bafkreigdj5jyzxnhfwpkkvslq4vadvyymyi6zgf4gdhsvjfqqmbzl7u7fi'
const ENTITY_TIMESTAMP = 1_700_000_000_000

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: spool read failed`), { code })
}

describe('when reading a spooled upload fails', () => {
  let spoolDir: string
  let increment: jest.Mock
  let release: jest.Mock
  let context: Context
  let errorHandler: ReturnType<typeof createErrorHandler>
  let response: HttpResponse

  function buildContext(partial: boolean): Context {
    const authChain = Authenticator.createSimpleAuthChain(ENTITY_ID, '0x' + '1'.repeat(40), '0x' + 'a'.repeat(130))
    const fields: Record<string, { fieldname: string; value: string }> = {
      entityId: { fieldname: 'entityId', value: ENTITY_ID },
      authChain: { fieldname: 'authChain', value: JSON.stringify(authChain) }
    }
    if (partial) {
      fields.partial = { fieldname: 'partial', value: 'true' }
    }
    const filePath = path.join(spoolDir, ENTITY_ID)
    writeFileSync(filePath, 'entity')
    return {
      request: { headers: { get: () => null } },
      formData: { fields, files: { [ENTITY_ID]: { fieldname: ENTITY_ID, path: filePath, size: 6 } } },
      components: {
        logs: { getLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
        metrics: { increment },
        crypto: { validateSignature: jest.fn().mockResolvedValue({ ok: true }) },
        deployer: {
          getDeployedEntityTimestamp: jest.fn().mockResolvedValue(undefined),
          readDeployment: jest.fn().mockResolvedValue({ hashes: [ENTITY_ID], entity: { timestamp: ENTITY_TIMESTAMP } })
        },
        contentLocks: { withRead: jest.fn() },
        partialDeployments: { stageDeployment: jest.fn() },
        deploymentMemoryBudget: { acquire: () => ({ resize: jest.fn(), release }) }
      }
    } as unknown as Context
  }

  beforeEach(() => {
    spoolDir = mkdtempSync(path.join(tmpdir(), 'create-entity-spool-read-'))
    increment = jest.fn()
    release = jest.fn()
    errorHandler = createErrorHandler({ logs: { getLogger: () => ({ error: jest.fn() }) } } as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    rmSync(spoolDir, { recursive: true, force: true })
  })

  describe.each([
    ['a regular deployment', false, ['dcl_deployments_endpoint_counter', { kind: 'error' }]],
    ['a partial batch', true, ['dcl_partial_deployments_staging_total', { kind: 'error' }]]
  ])('and it is %s', (_name, partial, endpointMetric) => {
    describe('and the read fails with a transient EIO', () => {
      beforeEach(async () => {
        jest.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(errnoError('EIO'))
        context = buildContext(partial)
        response = (await errorHandler({} as any, () => createEntity(context) as any)) as HttpResponse
      })

      it('should answer a retryable 503 with the upload Retry-After', () => {
        expect({ status: response.status, headers: response.headers }).toEqual({
          status: 503,
          headers: { 'Retry-After': '30' }
        })
      })

      it('should count it as a spool read failure', () => {
        expect(increment.mock.calls).toEqual([
          endpointMetric,
          ['dcl_upload_spool_failures_total', { reason: 'read_error' }]
        ])
      })

      it('should release the memory lease', () => {
        expect(release).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the spooled file is missing', () => {
      beforeEach(async () => {
        context = buildContext(partial)
        rmSync(path.join(spoolDir, ENTITY_ID))
        response = (await errorHandler({} as any, () => createEntity(context) as any)) as HttpResponse
      })

      it('should answer a 500', () => {
        expect(response.status).toBe(500)
      })

      it('should not count it as a spool read failure', () => {
        expect(increment.mock.calls).toEqual([endpointMetric])
      })

      it('should release the memory lease', () => {
        expect(release).toHaveBeenCalledTimes(1)
      })
    })
  })
})
