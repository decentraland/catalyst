import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { randomBytes } from 'crypto'
import { mkdir, readdir, rm, stat } from 'fs/promises'
import net from 'net'
import path from 'path'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { UploadSpoolFolderTooLongError } from './errors'
import { IUploadSpool } from './types'

const OWNER_SOCKET = '.owner'
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
    await reclaimIfAbandoned(path.join(root, entry))
  }
  await mkdir(folder)
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
      if (entries.every((entry) => entry === OWNER_SOCKET)) {
        await new Promise<void>((resolve) => owner.close(() => resolve()))
        await rm(folder, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }
}

// Reclaims a folder whose owner socket refuses connections, or that got no socket within the startup grace.
async function reclaimIfAbandoned(entryPath: string): Promise<void> {
  const state = await probeOwner(path.join(entryPath, OWNER_SOCKET))
  if (state === 'alive') {
    return
  }
  if (state === 'missing') {
    const entry = await stat(entryPath).catch(() => undefined)
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
