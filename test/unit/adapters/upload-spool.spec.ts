import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { access, mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { createUploadSpool, IUploadSpool } from '../../../src/adapters/upload-spool'

const DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000)

async function makeProcessFolder(root: string, name: string, lease: Date | undefined, folderTime?: Date) {
  const folder = path.join(root, name)
  await mkdir(path.join(folder, 'upload-1'), { recursive: true })
  await utimes(path.join(folder, 'upload-1'), DAY_AGO, DAY_AGO)
  if (lease) {
    await writeFile(path.join(folder, '.lease'), '')
    await utimes(path.join(folder, '.lease'), lease, lease)
  }
  if (folderTime) {
    await utimes(folder, folderTime, folderTime)
  }
}

describe('when creating the upload spool', () => {
  let root: string
  let spool: IUploadSpool
  let remaining: string[]
  let ownLease: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    await makeProcessFolder(root, 'expired-lease', DAY_AGO)
    await makeProcessFolder(root, 'long-running-upload', new Date())
    await makeProcessFolder(root, 'starting-without-lease', undefined)
    await makeProcessFolder(root, 'crashed-without-lease', undefined, DAY_AGO)
    spool = await createUploadSpool(root)
    remaining = (await readdir(root)).sort()
    ownLease = await access(path.join(spool.folder, '.lease')).then(
      () => true,
      () => false
    )
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('should reclaim only folders whose lease or age has lapsed and lease a folder for this process', () => {
    expect({ remaining, ownLease }).toEqual({
      remaining: ['long-running-upload', 'starting-without-lease', path.basename(spool.folder)].sort(),
      ownLease: true
    })
  })
})

describe('when the upload spool runs', () => {
  let root: string
  let leaseRenewed: boolean
  let folderRemovedOnStop: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    const spool = await createUploadSpool(root, { heartbeatMs: 20 })
    const leasePath = path.join(spool.folder, '.lease')
    await utimes(leasePath, DAY_AGO, DAY_AGO)
    await spool[START_COMPONENT]?.({} as any)
    await new Promise((resolve) => setTimeout(resolve, 100))
    leaseRenewed = (await stat(leasePath)).mtimeMs > Date.now() - 60_000
    await spool[STOP_COMPONENT]?.()
    folderRemovedOnStop = !(await readdir(root)).includes(path.basename(spool.folder))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('should keep renewing its lease and remove its idle folder when stopped', () => {
    expect({ leaseRenewed, folderRemovedOnStop }).toEqual({ leaseRenewed: true, folderRemovedOnStop: true })
  })
})
