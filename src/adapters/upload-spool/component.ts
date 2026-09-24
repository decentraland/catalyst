import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { randomUUID } from 'crypto'
import { mkdir, readdir, rm, rmdir, stat, utimes, writeFile } from 'fs/promises'
import path from 'path'
import { IUploadSpool, UploadSpoolOptions } from './types'

const LEASE_FILE = '.lease'
export const DEFAULT_SPOOL_HEARTBEAT_MS = 60 * 1000
export const DEFAULT_SPOOL_LEASE_TTL_MS = 10 * 60 * 1000

/**
 * Creates this process's spool folder under `root` and reclaims folders whose owners stopped renewing
 * their lease. A live process renews its lease every heartbeat for as long as it runs, so overlapping
 * processes (e.g. a rolling restart) never reclaim each other's in-flight uploads.
 * @param root Folder shared by every process using the same storage.
 * @param options Heartbeat and lease durations.
 * @returns The lifecycle-managed spool; the lease is renewed between start and stop.
 */
export async function createUploadSpool(root: string, options: UploadSpoolOptions = {}): Promise<IUploadSpool> {
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_SPOOL_HEARTBEAT_MS
  const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_SPOOL_LEASE_TTL_MS

  await mkdir(root, { recursive: true })
  const now = Date.now()
  for (const entry of await readdir(root)) {
    const entryPath = path.join(root, entry)
    if ((await leaseRenewedAt(entryPath)) < now - leaseTtlMs) {
      await rm(entryPath, { recursive: true, force: true })
    }
  }
  const folder = path.join(root, randomUUID())
  await mkdir(folder)
  const leasePath = path.join(folder, LEASE_FILE)
  await writeFile(leasePath, '')

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
      // Only an idle folder is removed; anything left is reclaimed once the lease expires.
      await rm(leasePath, { force: true }).catch(() => undefined)
      await rmdir(folder).catch(() => undefined)
    }
  }
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
