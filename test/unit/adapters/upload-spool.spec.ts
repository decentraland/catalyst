import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { spawn } from 'child_process'
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

// Leaves the owner socket behind the way a crashed process does: listening, then killed.
async function crashOwnerOf(folder: string): Promise<void> {
  const child = spawn(
    process.execPath,
    ['-e', "require('net').createServer().listen('.owner', () => console.log('ready'))"],
    { cwd: folder, stdio: ['ignore', 'pipe', 'inherit'] }
  )
  await new Promise((resolve) => child.stdout.once('data', resolve))
  child.kill('SIGKILL')
  await new Promise((resolve) => child.once('exit', resolve))
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
    await makeProcessFolder(root, 'crashed-with-owner-socket', DAY_AGO)
    await crashOwnerOf(path.join(root, 'crashed-with-owner-socket'))
    await utimes(path.join(root, 'crashed-with-owner-socket', '.lease'), DAY_AGO, DAY_AGO)
    spool = await createUploadSpool(root)
    remaining = (await readdir(root)).sort()
    ownLease = await access(path.join(spool.folder, '.lease')).then(
      () => true,
      () => false
    )
  })

  afterEach(async () => {
    await spool[STOP_COMPONENT]?.()
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

describe('when a live process stalls past its lease while another process starts', () => {
  let root: string
  let stalled: IUploadSpool
  let other: IUploadSpool
  let spoolFileKept: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    stalled = await createUploadSpool(root)
    await mkdir(path.join(stalled.folder, 'upload-in-flight'))
    await utimes(path.join(stalled.folder, '.lease'), DAY_AGO, DAY_AGO)
    await utimes(stalled.folder, DAY_AGO, DAY_AGO)
    other = await createUploadSpool(root)
    spoolFileKept = await access(path.join(stalled.folder, 'upload-in-flight')).then(
      () => true,
      () => false
    )
  })

  afterEach(async () => {
    await other[STOP_COMPONENT]?.()
    await rm(root, { recursive: true, force: true })
  })

  it('should keep the folder of the process that still listens on its owner socket', () => {
    expect(spoolFileKept).toBe(true)
  })
})

describe('when the upload spool stops while a request still holds spooled files', () => {
  let root: string
  let other: IUploadSpool
  let folderKept: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    const spool = await createUploadSpool(root)
    await spool[START_COMPONENT]?.({} as any)
    await mkdir(path.join(spool.folder, 'upload-in-flight'))
    await spool[STOP_COMPONENT]?.()
    await utimes(path.join(spool.folder, '.lease'), DAY_AGO, DAY_AGO)
    other = await createUploadSpool(root)
    folderKept = (await readdir(root)).includes(path.basename(spool.folder))
  })

  afterEach(async () => {
    await other[STOP_COMPONENT]?.()
    await rm(root, { recursive: true, force: true })
  })

  it('should keep the folder owned until the process exits, even once its lease lapses', () => {
    expect(folderKept).toBe(true)
  })
})

describe('when the spool root is longer than a socket path allows', () => {
  let root: string
  let stalled: IUploadSpool
  let other: IUploadSpool
  let spoolFileKept: boolean

  beforeEach(async () => {
    root = path.join(await mkdtemp(path.join(tmpdir(), 'upload-spool-')), 'a'.repeat(120))
    stalled = await createUploadSpool(root)
    await mkdir(path.join(stalled.folder, 'upload-in-flight'))
    await utimes(path.join(stalled.folder, '.lease'), DAY_AGO, DAY_AGO)
    other = await createUploadSpool(root)
    spoolFileKept = await access(path.join(stalled.folder, 'upload-in-flight')).then(
      () => true,
      () => false
    )
  })

  afterEach(async () => {
    await other[STOP_COMPONENT]?.()
    await rm(path.dirname(root), { recursive: true, force: true })
  })

  it('should still reach the owner socket and keep the live owner folder', () => {
    expect(spoolFileKept).toBe(true)
  })
})
