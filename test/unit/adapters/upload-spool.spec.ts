import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { ChildProcess, spawn } from 'child_process'
import { access, lstat, mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { createUploadSpool, IUploadSpool, UploadSpoolFolderTooLongError } from '../../../src/adapters/upload-spool'
import { SPOOL_MARKER } from '../../../src/adapters/upload-spool/component'
import { Environment, EnvironmentBuilder, EnvironmentConfig } from '../../../src/Environment'

const DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000)
// Process folder names shaped like the generated ones.
const CRASHED_OWNER = '00000000000000a1'
const STARTING_WITHOUT_SOCKET = '00000000000000a2'
const CRASHED_BEFORE_LISTENING = '00000000000000a3'

function envWithSpoolFolder(root: string): Environment {
  const env = new Environment()
  env.setConfig(EnvironmentConfig.UPLOAD_SPOOL_FOLDER, root)
  return env
}

async function makeProcessFolder(root: string, name: string, folderTime?: Date): Promise<string> {
  const folder = path.join(root, name)
  await mkdir(path.join(folder, 'upload-1'), { recursive: true })
  await writeFile(path.join(folder, SPOOL_MARKER), '')
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
  let ownMarker: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    const crashed = await makeProcessFolder(root, CRASHED_OWNER)
    await kill(await listenAsOwnerOf(crashed))
    await makeProcessFolder(root, STARTING_WITHOUT_SOCKET)
    await makeProcessFolder(root, CRASHED_BEFORE_LISTENING, DAY_AGO)
    spool = await createUploadSpool({ env: envWithSpoolFolder(root) })
    remaining = (await readdir(root)).sort()
    ownSocket = await exists(path.join(spool.folder, '.owner'))
    ownMarker = await exists(path.join(spool.folder, SPOOL_MARKER))
  })

  afterEach(async () => {
    await spool[STOP_COMPONENT]?.()
    await rm(root, { recursive: true, force: true })
  })

  it('should reclaim the folders of exited processes and mark and listen on its own folder', () => {
    expect({ remaining, ownSocket, ownMarker }).toEqual({
      remaining: [STARTING_WITHOUT_SOCKET, path.basename(spool.folder)].sort(),
      ownSocket: true,
      ownMarker: true
    })
  })
})

describe('when the spool root holds entries this component did not create', () => {
  let root: string
  let elsewhere: string
  let spool: IUploadSpool
  let unrelatedFileKept: boolean
  let unmarkedFolderKept: boolean
  let otherNamedFolderKept: boolean
  let crashedOwnerFolderKept: boolean
  let symlinkKept: boolean
  let symlinkTargetKept: boolean

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'upload-spool-'))
    elsewhere = await mkdtemp(path.join(tmpdir(), 'upload-spool-target-'))
    await writeFile(path.join(root, 'unrelated.log'), 'data')
    await utimes(path.join(root, 'unrelated.log'), DAY_AGO, DAY_AGO)
    // Hex-named like a process folder and holding a dead socket, but without the marker.
    const unmarked = path.join(root, '00000000000000d1')
    await mkdir(path.join(unmarked, 'data'), { recursive: true })
    await kill(await listenAsOwnerOf(unmarked))
    await utimes(unmarked, DAY_AGO, DAY_AGO)
    // Marked, with a dead socket, but not named like a generated process folder.
    const otherNamed = await makeProcessFolder(root, 'backups', DAY_AGO)
    await kill(await listenAsOwnerOf(otherNamed))
    // A marked process folder reached through a symlink must not be followed.
    const target = await makeProcessFolder(elsewhere, '00000000000000d2')
    await kill(await listenAsOwnerOf(target))
    await symlink(target, path.join(root, '00000000000000d2'))
    const crashed = await makeProcessFolder(root, CRASHED_OWNER)
    await kill(await listenAsOwnerOf(crashed))
    spool = await createUploadSpool({ env: envWithSpoolFolder(root) })
    unrelatedFileKept = await exists(path.join(root, 'unrelated.log'))
    unmarkedFolderKept = await exists(path.join(unmarked, 'data'))
    otherNamedFolderKept = await exists(path.join(otherNamed, 'upload-1'))
    crashedOwnerFolderKept = await exists(crashed)
    symlinkKept = await lstat(path.join(root, '00000000000000d2')).then(
      () => true,
      () => false
    )
    symlinkTargetKept = await exists(path.join(target, 'upload-1'))
  })

  afterEach(async () => {
    await spool[STOP_COMPONENT]?.()
    await rm(root, { recursive: true, force: true })
    await rm(elsewhere, { recursive: true, force: true })
  })

  it('should leave every unrelated entry untouched and still reclaim the marked folder of an exited process', () => {
    expect({
      unrelatedFileKept,
      unmarkedFolderKept,
      otherNamedFolderKept,
      symlinkKept,
      symlinkTargetKept,
      crashedOwnerFolderKept
    }).toEqual({
      unrelatedFileKept: true,
      unmarkedFolderKept: true,
      otherNamedFolderKept: true,
      symlinkKept: true,
      symlinkTargetKept: true,
      crashedOwnerFolderKept: false
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
    const folder = await makeProcessFolder(root, '00000000000000b1')
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
    remoteFolder = await makeProcessFolder(path.join(storageRoot, 'contents', '_uploads'), '00000000000000c1')
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
