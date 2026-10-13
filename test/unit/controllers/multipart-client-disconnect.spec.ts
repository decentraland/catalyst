/**
 * @jest-environment ./test/fetch-environment.js
 */
import FormData from 'form-data'
import { mkdtemp, readdir, rm } from 'fs/promises'
import { AddressInfo } from 'net'
import http from 'http'
import { tmpdir } from 'os'
import path from 'path'
import { createServerComponent, getUnderlyingServer } from '@dcl/http-server'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { ClientClosedRequestError } from '../../../src/controllers/errors'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { spoolIn } from '../../helpers/upload-spool'

describe('when the client disconnects in the middle of a multipart upload to a real server', () => {
  let tmpFolder: string
  let server: Awaited<ReturnType<typeof createServerComponent>>
  let handler: jest.Mock
  let increment: jest.Mock
  let release: jest.Mock
  let failure: unknown
  let leftovers: string[]

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    increment = jest.fn()
    release = jest.fn()
    const logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'ERROR' }) })
    server = await createServerComponent(
      { config: createConfigComponent({ HTTP_SERVER_PORT: '0', HTTP_SERVER_HOST: '127.0.0.1' }), logs },
      {}
    )
    const wrapped = multipartParserWrapper(
      handler as any,
      { maxFileSize: 1024 * 1024, uploadTimeoutMs: 10_000 },
      {
        spool: spoolIn(tmpFolder),
        uploadBudget: { acquire: () => ({ resize: () => true, release }) } as any,
        metrics: { increment }
      }
    )
    let settled: () => void
    const handled = new Promise<void>((resolve) => (settled = resolve))
    let started: () => void
    const receiving = new Promise<void>((resolve) => (started = resolve))
    server.use(async (ctx) => {
      started()
      try {
        return await wrapped(ctx)
      } catch (error) {
        failure = error
        throw error
      } finally {
        settled()
      }
    })
    await server.start!({} as any)
    const { port } = (await getUnderlyingServer<http.Server>(server)).address() as AddressInfo

    const form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(512 * 1024, 1), { filename: 'file1' })
    const body = form.getBuffer()
    const request = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/entities',
      headers: { ...form.getHeaders(), 'content-length': String(body.length) }
    })
    request.on('error', () => undefined)
    request.write(body.subarray(0, 64 * 1024))
    await receiving
    // Lets the first chunk reach the parser before the client goes away.
    await new Promise((resolve) => setTimeout(resolve, 50))
    request.destroy()
    await handled
    leftovers = await readdir(tmpFolder)
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await server.stop!()
    await rm(tmpFolder, { recursive: true, force: true })
  })

  it('should fail with a ClientClosedRequestError, skip the handler, release the upload slot and remove the spool', () => {
    expect({
      failure,
      handled: handler.mock.calls.length,
      released: release.mock.calls.length,
      leftovers
    }).toEqual({
      failure: new ClientClosedRequestError('The client closed the connection before the upload was received.'),
      handled: 0,
      released: 1,
      leftovers: []
    })
  })

  it('should count one upload aborted by the client', () => {
    expect(increment.mock.calls).toEqual([['dcl_multipart_upload_aborts_total', { reason: 'client_closed' }]])
  })
})
