import { randomUUID } from 'crypto'
import { mkdir, readdir, rm, stat } from 'fs/promises'
import path from 'path'

/** A spool folder untouched for this long belongs to a process that is gone. */
export const STALE_UPLOAD_SPOOL_MS = 24 * 60 * 60 * 1000

/**
 * Creates this process's upload spool folder under `root` and removes folders left by processes that
 * are gone. Folders with recent activity are kept, so overlapping processes (e.g. a rolling restart)
 * can share `root` without deleting each other's in-flight uploads.
 * @param root Folder shared by every process using the same storage.
 * @param now Current time, in milliseconds.
 * @returns The process-unique spool folder.
 */
export async function prepareUploadSpool(root: string, now: number = Date.now()): Promise<string> {
  await mkdir(root, { recursive: true })
  for (const entry of await readdir(root)) {
    const entryPath = path.join(root, entry)
    if ((await lastActivity(entryPath)) < now - STALE_UPLOAD_SPOOL_MS) {
      await rm(entryPath, { recursive: true, force: true })
    }
  }
  const folder = path.join(root, randomUUID())
  await mkdir(folder)
  return folder
}

async function lastActivity(entryPath: string): Promise<number> {
  const info = await stat(entryPath).catch(() => undefined)
  if (!info) {
    return Number.POSITIVE_INFINITY
  }
  if (!info.isDirectory()) {
    return info.mtimeMs
  }
  // A request folder is created and removed inside the process folder, refreshing its mtime; the
  // children cover a single long-running request in an otherwise idle process.
  const children = await readdir(entryPath).catch(() => [] as string[])
  const childTimes = await Promise.all(
    children.map(async (child) => (await stat(path.join(entryPath, child)).catch(() => undefined))?.mtimeMs ?? 0)
  )
  return Math.max(info.mtimeMs, ...childTimes)
}
