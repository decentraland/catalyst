import FormData from 'form-data'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Readable, Writable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { MAX_OPEN_SPOOL_FILES, multipartParserWrapper } from '../../../src/controllers/multipart'

function buildContext(form: FormData): IHttpServerComponent.DefaultContext<any> {
  const headers = form.getHeaders()
  return {
    request: {
      headers: { get: (name: string) => headers[name.toLowerCase()] },
      body: Readable.toWeb(Readable.from(form.getBuffer()))
    }
  } as any
}

describe('when a request carries more files than can be spooled at once', () => {
  const FILE_COUNT = MAX_OPEN_SPOOL_FILES * 4
  let tmpFolder: string
  let maxOpen: number
  let receivedFiles: number

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    let open = 0
    maxOpen = 0
    // A slow disk: every temporary file takes a while to flush and close.
    const createWriteStream = (): Writable => {
      open++
      maxOpen = Math.max(maxOpen, open)
      const writer = new Writable({
        write: (_chunk, _encoding, callback) => setTimeout(callback, 5),
        final: (callback) => setTimeout(callback, 20)
      })
      writer.on('close', () => open--)
      return writer
    }
    const form = new FormData()
    for (let i = 0; i < FILE_COUNT; i++) {
      form.append(`file${i}`, Buffer.from(`content ${i}`), { filename: `file${i}` })
    }
    const handler = jest.fn(async (ctx: any) => {
      receivedFiles = Object.keys(ctx.formData.files).length
      return { status: 200, body: {} }
    })
    await multipartParserWrapper(
      handler as any,
      { maxFiles: FILE_COUNT },
      { tmpFolder, createWriteStream }
    )(buildContext(form))
  })

  afterEach(async () => {
    await rm(tmpFolder, { recursive: true, force: true })
  })

  it('should never hold more open temporary files than the cap and still receive every file', () => {
    expect({ withinCap: maxOpen <= MAX_OPEN_SPOOL_FILES, receivedFiles }).toEqual({
      withinCap: true,
      receivedFiles: FILE_COUNT
    })
  })
})
