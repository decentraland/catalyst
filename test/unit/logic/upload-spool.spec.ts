import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { prepareUploadSpool, STALE_UPLOAD_SPOOL_MS } from '../../../src/logic/upload-spool'

describe('when preparing the upload spool folder', () => {
  let root: string
  let spool: string
  let remaining: string[]

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    const stale = new Date(Date.now() - STALE_UPLOAD_SPOOL_MS - 60_000)
    await mkdir(path.join(root, 'gone-process'))
    await writeFile(path.join(root, 'gone-process', 'leftover'), 'x')
    await utimes(path.join(root, 'gone-process', 'leftover'), stale, stale)
    await utimes(path.join(root, 'gone-process'), stale, stale)
    await mkdir(path.join(root, 'live-process'))
    await mkdir(path.join(root, 'long-request-process'))
    await mkdir(path.join(root, 'long-request-process', 'upload-1'))
    await utimes(path.join(root, 'long-request-process'), stale, stale)
    spool = await prepareUploadSpool(root)
    remaining = (await readdir(root)).sort()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('should remove only folders without recent activity and create a folder for this process', () => {
    expect({ remaining, ownFolderInRoot: path.dirname(spool) === root }).toEqual({
      remaining: ['live-process', 'long-request-process', path.basename(spool)].sort(),
      ownFolderInRoot: true
    })
  })
})
