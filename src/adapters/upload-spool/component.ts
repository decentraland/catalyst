import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { randomBytes } from 'crypto'
import { lstat, mkdir, readdir, rm, writeFile } from 'fs/promises'
import net from 'net'
import path from 'path'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { UploadSpoolFolderTooLongError } from './errors'
import { IUploadSpool } from './types'

const OWNER_SOCKET = '.owner'
// Written right after a process folder is created, before its socket: only marked folders are ever reclaimed.
export const SPOOL_MARKER = '.catalyst-upload-spool'
// Process folders are named with 8 random bytes in hex.
const PROCESS_FOLDER_NAME = /^[0-9a-f]{16}$/
// Unix socket paths are capped at 104 bytes on macOS and 108 on Linux.
const MAX_SOCKET_PATH = 100
const OWNER_PROBE_TIMEOUT_MS = 1000
// Probe errors meaning a folder has no owner socket (yet): only its age tells a crash from a startup.
const NO_SOCKET_ERRORS = new Set(['ENOENT', 'ENOTDIR', 'ENOTSOCK'])
// How long a folder without an owner socket is left to the process that is still creating it.
export const SPOOL_STARTUP_GRACE_MS = 10 * 60 * 1000

type OwnerState = 'alive' | 'dead' | 'missing'

/**
 * Creates this process's spool folder under UPLOAD_SPOOL_FOLDER and reclaims folders of exited processes.
 * The owner listens on a unix socket in its folder until it exits, so the kernel answers for a live
 * process even while it stalls. That proof only holds between processes of one host, so the spool root
 * must be node-local: never a folder shared with other hosts, such as the content storage.
 * Only root entries positively identified as process folders (real directory, generated name, marker file)
 * are ever reclaimed, so anything else in the root is left untouched.
 * @param components Reads UPLOAD_SPOOL_FOLDER from `env`.
 * @returns The lifecycle-managed spool; its folder stays owned until stop, or exit if spools remain.
 * @throws UploadSpoolFolderTooLongError when the folder path can't hold the owner socket.
 */
export async function createUploadSpool(components: Pick<AppComponents, 'env'>): Promise<IUploadSpool> {
  const { env } = components
  const root = path.resolve(env.getConfig<string>(EnvironmentConfig.UPLOAD_SPOOL_FOLDER))
  const folder = path.join(root, randomBytes(8).toString('hex'))
  const socketPath = path.join(folder, OWNER_SOCKET)
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH) {
    throw new UploadSpoolFolderTooLongError(root)
  }

  await mkdir(root, { recursive: true })
  for (const entry of await readdir(root)) {
    if (PROCESS_FOLDER_NAME.test(entry) && (await isProcessFolder(path.join(root, entry)))) {
      await reclaimIfAbandoned(path.join(root, entry))
    }
  }
  await mkdir(folder)
  await writeFile(path.join(folder, SPOOL_MARKER), '', { flag: 'wx', mode: 0o600 })
  const owner = net.createServer((connection) => connection.destroy())
  await new Promise<void>((resolve, reject) => {
    owner.once('error', reject)
    owner.listen(socketPath, () => {
      owner.off('error', reject)
      resolve()
    })
  })
  owner.unref()

  return {
    folder,
    async [STOP_COMPONENT]() {
      // A folder still holding spools stays owned until this process exits.
      const entries = await readdir(folder).catch(() => [])
      if (entries.every((entry) => entry === OWNER_SOCKET || entry === SPOOL_MARKER)) {
        await new Promise<void>((resolve) => owner.close(() => resolve()))
        await rm(folder, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }
}

// A real directory (symlinks are never followed) holding this component's marker as a regular file.
async function isProcessFolder(entryPath: string): Promise<boolean> {
  const entry = await lstat(entryPath).catch(() => undefined)
  if (!entry?.isDirectory()) {
    return false
  }
  const marker = await lstat(path.join(entryPath, SPOOL_MARKER)).catch(() => undefined)
  return marker?.isFile() ?? false
}

// Reclaims a folder whose owner socket refuses connections, or that got no socket within the startup grace.
async function reclaimIfAbandoned(entryPath: string): Promise<void> {
  const state = await probeOwner(path.join(entryPath, OWNER_SOCKET))
  if (state === 'alive') {
    return
  }
  if (state === 'missing') {
    const entry = await lstat(entryPath).catch(() => undefined)
    if (!entry || entry.mtimeMs >= Date.now() - SPOOL_STARTUP_GRACE_MS) {
      return
    }
  }
  await rm(entryPath, { recursive: true, force: true })
}

// Anything but a refused or missing socket counts as alive, so an unexpected error never deletes.
function probeOwner(socketPath: string): Promise<OwnerState> {
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH) {
    return Promise.resolve('alive')
  }
  return new Promise((resolve) => {
    const probe = net.connect(socketPath)
    const settle = (state: OwnerState): void => {
      clearTimeout(timer)
      probe.destroy()
      resolve(state)
    }
    const timer = setTimeout(() => settle('alive'), OWNER_PROBE_TIMEOUT_MS)
    probe.once('connect', () => settle('alive'))
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') {
        settle('dead')
      } else {
        settle(NO_SOCKET_ERRORS.has(error.code ?? '') ? 'missing' : 'alive')
      }
    })
  })
}
