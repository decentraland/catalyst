import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { randomUUID } from 'crypto'
import { mkdir, readdir, rename, rm, rmdir, stat, utimes, writeFile } from 'fs/promises'
import path from 'path'
import { IUploadSpool, UploadSpoolOptions } from './types'

const LEASE_FILE = '.lease'
const CLAIM_MARKER = '.reclaiming-'
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
  for (const entry of await readdir(root)) {
    await reclaimIfStale(path.join(root, entry), leaseTtlMs)
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
      // Only an idle folder is removed. A folder still holding spools keeps its lease, which expires now
      // that the heartbeat stopped, so it is reclaimed only after any overlapping request is done.
      const entries = await readdir(folder).catch(() => [LEASE_FILE])
      if (entries.every((entry) => entry === LEASE_FILE)) {
        await rm(leasePath, { force: true }).catch(() => undefined)
        await rmdir(folder).catch(() => writeFile(leasePath, '').catch(() => undefined))
      }
    }
  }
}

/**
 * Reclaims a folder whose lease lapsed. The folder is claimed by an atomic rename and the lease is read
 * again, so an owner that renewed between the check and the claim gets its folder back untouched.
 * @param entryPath Folder under the spool root.
 * @param leaseTtlMs How long an unrenewed lease protects the folder, in milliseconds.
 * @param beforeClaim Runs between the lease check and the claim (for tests).
 * @returns Whether the folder was removed.
 */
export async function reclaimIfStale(
  entryPath: string,
  leaseTtlMs: number,
  beforeClaim?: () => Promise<void>
): Promise<boolean> {
  const renewedAt = await leaseRenewedAt(entryPath)
  if (renewedAt >= Date.now() - leaseTtlMs) {
    return false
  }
  // Leftovers of a reclaimer that stopped mid-way are already claimed.
  if (path.basename(entryPath).includes(CLAIM_MARKER)) {
    await rm(entryPath, { recursive: true, force: true })
    return true
  }
  await beforeClaim?.()
  const claimed = `${entryPath}${CLAIM_MARKER}${randomUUID()}`
  try {
    await rename(entryPath, claimed)
  } catch {
    return false
  }
  if ((await leaseRenewedAt(claimed)) !== renewedAt) {
    await rename(claimed, entryPath).catch(() => undefined)
    return false
  }
  await rm(claimed, { recursive: true, force: true })
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
