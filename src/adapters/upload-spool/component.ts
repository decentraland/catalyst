import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp, readdir, rm, stat, symlink, utimes, writeFile } from 'fs/promises'
import net from 'net'
import { tmpdir } from 'os'
import path from 'path'
import { IUploadSpool, UploadSpoolOptions } from './types'

const LEASE_FILE = '.lease'
const OWNER_SOCKET = '.owner'
// Connection errors that prove nobody listens on a folder's owner socket.
const NO_OWNER_ERRORS = new Set(['ECONNREFUSED', 'ENOENT', 'ENOTDIR', 'ENOTSOCK'])
const OWNER_PROBE_TIMEOUT_MS = 1000
// Unix socket paths are capped at 104 bytes on macOS and 108 on Linux.
const MAX_SOCKET_PATH = 100
export const DEFAULT_SPOOL_HEARTBEAT_MS = 60 * 1000
export const DEFAULT_SPOOL_LEASE_TTL_MS = 10 * 60 * 1000

/**
 * Creates this process's spool folder under `root` and reclaims folders whose owner process is gone.
 * The owner listens on a socket in its folder for as long as it lives, so a stalled but live process
 * keeps its folder; the renewed lease additionally protects owners the socket can't reach.
 * @param root Folder shared by every process using the same storage.
 * @param options Heartbeat and lease durations.
 * @returns The lifecycle-managed spool; the lease is renewed between start and stop.
 */
export async function createUploadSpool(root: string, options: UploadSpoolOptions = {}): Promise<IUploadSpool> {
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_SPOOL_HEARTBEAT_MS
  const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_SPOOL_LEASE_TTL_MS

  await mkdir(root, { recursive: true })
  for (const entry of await readdir(root)) {
    await reclaimIfAbandoned(path.join(root, entry), leaseTtlMs)
  }
  const folder = path.join(root, randomUUID())
  await mkdir(folder)
  const leasePath = path.join(folder, LEASE_FILE)
  await writeFile(leasePath, '')
  const owner = net.createServer((connection) => connection.destroy())
  await withSocketPath(
    folder,
    (socketPath) =>
      new Promise<void>((resolve, reject) => {
        owner.once('error', reject)
        owner.listen(socketPath, () => {
          owner.off('error', reject)
          resolve()
        })
      })
  )
  owner.unref()

  let heartbeat: NodeJS.Timeout | undefined
  return {
    folder,
    async [START_COMPONENT]() {
      heartbeat = setInterval(() => {
        const renewedAt = new Date()
        void utimes(leasePath, renewedAt, renewedAt).catch(() => writeFile(leasePath, '').catch(() => undefined))
      }, heartbeatMs)
      heartbeat.unref()
    },
    async [STOP_COMPONENT]() {
      clearInterval(heartbeat)
      // A folder still holding spools stays owned until this process exits.
      const entries = await readdir(folder).catch(() => [])
      if (entries.every((entry) => entry === LEASE_FILE || entry === OWNER_SOCKET)) {
        await new Promise<void>((resolve) => owner.close(() => resolve()))
        await rm(folder, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }
}

/**
 * Removes a folder whose lease lapsed and whose owner socket has no listener.
 * @param entryPath Folder under the spool root.
 * @param leaseTtlMs How long an unrenewed lease protects the folder, in milliseconds.
 * @returns Whether the folder was removed.
 */
export async function reclaimIfAbandoned(entryPath: string, leaseTtlMs: number): Promise<boolean> {
  if ((await leaseRenewedAt(entryPath)) >= Date.now() - leaseTtlMs) {
    return false
  }
  if (await ownerIsAlive(entryPath)) {
    return false
  }
  await rm(entryPath, { recursive: true, force: true })
  return true
}

// A folder without a lease is a process that stopped between creating it and writing the lease.
async function leaseRenewedAt(entryPath: string): Promise<number> {
  const lease = await stat(path.join(entryPath, LEASE_FILE)).catch(() => undefined)
  if (lease) {
    return lease.mtimeMs
  }
  const folder = await stat(entryPath).catch(() => undefined)
  return folder ? folder.mtimeMs : Number.POSITIVE_INFINITY
}

// Anything but a refused or missing socket counts as alive, so an unexpected error never deletes.
function ownerIsAlive(entryPath: string): Promise<boolean> {
  return withSocketPath(entryPath, (socketPath) => probeOwner(socketPath)).catch(() => true)
}

function probeOwner(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.connect(socketPath)
    const settle = (alive: boolean): void => {
      clearTimeout(timer)
      probe.destroy()
      resolve(alive)
    }
    const timer = setTimeout(() => settle(true), OWNER_PROBE_TIMEOUT_MS)
    probe.once('connect', () => settle(true))
    probe.once('error', (error: NodeJS.ErrnoException) => settle(!NO_OWNER_ERRORS.has(error.code ?? '')))
  })
}

// A folder whose socket path is too long is reached through a short symlink, which binds and connects to
// the same socket file inside the folder.
async function withSocketPath<T>(folder: string, use: (socketPath: string) => Promise<T>): Promise<T> {
  const socketPath = path.join(folder, OWNER_SOCKET)
  if (Buffer.byteLength(socketPath) <= MAX_SOCKET_PATH) {
    return use(socketPath)
  }
  const linkRoot = await mkdtemp(path.join(tmpdir(), 'spool-'))
  try {
    const link = path.join(linkRoot, 'f')
    await symlink(folder, link)
    return await use(path.join(link, OWNER_SOCKET))
  } finally {
    await rm(linkRoot, { recursive: true, force: true })
  }
}
