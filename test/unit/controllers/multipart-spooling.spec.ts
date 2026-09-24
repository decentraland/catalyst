import FormData from 'form-data'
import { access, mkdtemp, readdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Readable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'

type Wrapped = (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

function buildContext(form: FormData): IHttpServerComponent.DefaultContext<any> {
  const headers = form.getHeaders()
  return {
    request: {
      headers: { get: (name: string) => headers[name.toLowerCase()] },
      body: Readable.toWeb(Readable.from(form.getBuffer()))
    }
  } as any
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  )
}

describe('when a multipart request spools its files to disk', () => {
  let tmpFolder: string
  let form: FormData
  let handler: jest.Mock
  let spooledPath: string
  let wrapped: Wrapped

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.from('spooled content'), { filename: 'file1' })
    handler = jest.fn()
    wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024 }, { tmpFolder })
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await rm(tmpFolder, { recursive: true, force: true })
  })

  describe('and the handler succeeds', () => {
    let contentDuringHandler: string
    let existsAfterwards: boolean
    let leftovers: string[]

    beforeEach(async () => {
      handler.mockImplementationOnce(async (ctx: any) => {
        spooledPath = ctx.formData.files.file1.path
        contentDuringHandler = (await readFile(spooledPath)).toString()
        return { status: 200, body: {} }
      })
      await wrapped(buildContext(form))
      existsAfterwards = await exists(spooledPath)
      leftovers = await readdir(tmpFolder)
    })

    it('should hand the handler the file on disk and remove it once the handler returns', () => {
      expect({ contentDuringHandler, existsAfterwards, leftovers }).toEqual({
        contentDuringHandler: 'spooled content',
        existsAfterwards: false,
        leftovers: []
      })
    })
  })

  describe('and the handler fails', () => {
    let error: unknown
    let leftovers: string[]

    beforeEach(async () => {
      handler.mockRejectedValueOnce(new Error('handler failed'))
      error = await wrapped(buildContext(form)).catch((e) => e)
      leftovers = await readdir(tmpFolder)
    })

    it('should still remove the temporary files', () => {
      expect({ error, leftovers }).toEqual({ error: new Error('handler failed'), leftovers: [] })
    })
  })
})
