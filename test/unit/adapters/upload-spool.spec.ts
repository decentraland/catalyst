import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { ChildProcess, spawn } from 'child_process'
import { access, mkdir, mkdtemp, readdir, rm, utimes } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { createUploadSpool, IUploadSpool, UploadSpoolFolderTooLongError } from '../../../src/adapters/upload-spool'
import { Environment, EnvironmentBuilder, EnvironmentConfig } from '../../../src/Environment'

const DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000)

function envWithSpoolFolder(root: string): Environment {
  const env = new Environment()
  env.setConfig(EnvironmentConfig.UPLOAD_SPOOL_FOLDER, root)
  return env
}

async function makeProcessFolder(root: string, name: string, folderTime?: Date): Promise<string> {
  const folder = path.join(root, name)
  await mkdir(path.join(folder, 'upload-1'), { recursive: true })
  if (folderTime) {
    await utimes(folder, folderTime, folderTime)
  }
  return folder
}

// Starts a process that owns `folder` by listening on its owner socket.
async function listenAsOwnerOf(folder: string): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ['-e', "require('net').createServer().listen('.owner', () => console.log('ready'))"],
    { cwd: folder, stdio: ['ignore', 'pipe', 'inherit'] }
  )
  await new Promise((resolve) => child.stdout!.once('data', resolve))
  return child
}

async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill('SIGKILL')
    await exited
  }
}

function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  )
}

describe('when creating the upload spool', () => {
  let root: string
  let spool: IUploadSpool
  let remaining: string[]
  let ownSocket: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    const crashed = await makeProcessFolder(root, 'crashed-owner')
    await kill(await listenAsOwnerOf(crashed))
    await makeProcessFolder(root, 'starting-without-socket')
    await makeProcessFolder(root, 'crashed-before-listening', DAY_AGO)
    spool = await createUploadSpool({ env: envWithSpoolFolder(root) })
    remaining = (await readdir(root)).sort()
    ownSocket = await exists(path.join(spool.folder, '.owner'))
  })

  afterEach(async () => {
    await spool[STOP_COMPONENT]?.()
    await rm(root, { recursive: true, force: true })
  })

  it('should reclaim the folders of exited processes and listen on its own owner socket', () => {
    expect({ remaining, ownSocket }).toEqual({
      remaining: ['starting-without-socket', path.basename(spool.folder)].sort(),
      ownSocket: true
    })
  })
})

describe('when a process of the same host is stalled while another process starts', () => {
  let root: string
  let stalledOwner: ChildProcess
  let other: IUploadSpool
  let spoolFileKept: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    const folder = await makeProcessFolder(root, 'stalled-owner')
    stalledOwner = await listenAsOwnerOf(folder)
    stalledOwner.kill('SIGSTOP')
    await utimes(folder, DAY_AGO, DAY_AGO)
    other = await createUploadSpool({ env: envWithSpoolFolder(root) })
    spoolFileKept = await exists(path.join(folder, 'upload-1'))
  })

  afterEach(async () => {
    await kill(stalledOwner)
    await other[STOP_COMPONENT]?.()
    await rm(root, { recursive: true, force: true })
  })

  it('should keep the folder of the process that still owns its socket', () => {
    expect(spoolFileKept).toBe(true)
  })
})

describe('when another host owns a live spool in the shared content storage', () => {
  let storageRoot: string
  let remoteFolder: string
  let spool: IUploadSpool
  let remoteSpoolKept: boolean
  let spoolInStorage: boolean

  beforeEach(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 's-'))
    // Seen from this host, a remote owner's socket has no listener, exactly like a crashed one.
    remoteFolder = await makeProcessFolder(path.join(storageRoot, 'contents', '_uploads'), 'remote-owner')
    await kill(await listenAsOwnerOf(remoteFolder))
    await utimes(remoteFolder, DAY_AGO, DAY_AGO)
    const env = await new EnvironmentBuilder().withConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, storageRoot).build()
    spool = await createUploadSpool({ env })
    remoteSpoolKept = await exists(path.join(remoteFolder, 'upload-1'))
    spoolInStorage = !path.relative(storageRoot, spool.folder).startsWith('..')
  })

  afterEach(async () => {
    await spool[STOP_COMPONENT]?.()
    await rm(storageRoot, { recursive: true, force: true })
  })

  it('should spool on node-local disk and leave the remote spool untouched', () => {
    expect({ remoteSpoolKept, spoolInStorage }).toEqual({ remoteSpoolKept: true, spoolInStorage: false })
  })
})

describe('when the upload spool stops', () => {
  let root: string
  let spool: IUploadSpool

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    spool = await createUploadSpool({ env: envWithSpoolFolder(root) })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('and its folder is idle', () => {
    let folderRemoved: boolean

    beforeEach(async () => {
      await spool[STOP_COMPONENT]?.()
      folderRemoved = !(await readdir(root)).includes(path.basename(spool.folder))
    })

    it('should remove its folder', () => {
      expect(folderRemoved).toBe(true)
    })
  })

  describe('and a request still holds spooled files', () => {
    let other: IUploadSpool
    let folderKept: boolean

    beforeEach(async () => {
      await mkdir(path.join(spool.folder, 'upload-in-flight'))
      await spool[STOP_COMPONENT]?.()
      await utimes(spool.folder, DAY_AGO, DAY_AGO)
      other = await createUploadSpool({ env: envWithSpoolFolder(root) })
      folderKept = await exists(path.join(spool.folder, 'upload-in-flight'))
    })

    afterEach(async () => {
      await other[STOP_COMPONENT]?.()
    })

    it('should keep the folder owned until the process exits', () => {
      expect(folderKept).toBe(true)
    })
  })
})

describe('when the spool folder is too long to hold the owner socket', () => {
  let root: string
  let creation: Promise<IUploadSpool>

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    creation = createUploadSpool({ env: envWithSpoolFolder(path.join(root, 'a'.repeat(100))) })
    await creation.catch(() => undefined)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('should fail with an UploadSpoolFolderTooLongError', async () => {
    await expect(creation).rejects.toBeInstanceOf(UploadSpoolFolderTooLongError)
  })
})
