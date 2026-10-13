import { Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { EntityLockTimeoutError } from '../../adapters/content-locks'
import {
  ExpiredUpload,
  FileReceipt,
  OldestUploadScope,
  PendingDeploymentRow,
  PointerUsage
} from '../../adapters/pending-deployments-repository'
import { DatabaseClient } from '../../adapters/database'
import { EnvironmentConfig } from '../../Environment'
import { DeploymentContext, isInvalidDeployment } from '../../deployment-types'
import { AppComponents } from '../../types'
import { newerEntityMessage, REQUEST_TTL_FORWARDS } from '../deployment-service/server-validator'
import { storeStreamsInBatches } from '../store-content'
import {
  InvalidPartialDeploymentError,
  PartialDeploymentUnavailableError,
  PartialUploadThrottleReason,
  StagedContentDeleteError
} from './errors'
import {
  ExpiredCleanupSummary,
  IPartialDeployments,
  PartialUploadStage,
  StageDeploymentInput,
  StageDeploymentResult
} from './types'

// A batch whose request-only checks passed, ready to be stored under the content lock.
type PreparedBatch = {
  entity: Entity
  entityFile: Uint8Array
  authChain: StageDeploymentInput['authChain']
  uploadedFiles: Map<string, Uint8Array>
  deployerAddress: string
  contentHashes: string[]
  maxSceneBytes: bigint
  /** The upload as it was when the batch was prepared, if it existed. */
  seen: PendingDeploymentRow | undefined
  requestedAt: number
  onAdmitted: StageDeploymentInput['onAdmitted']
}

// Filled when a batch releases its upload, so the staged keys are reclaimed once the content lock is free.
type ReleasedUpload = { stagedKeys?: string[] }

// Bounded retry for two requests completing the same upload at once: the loser of the in-memory
// pointer lock retries and hits deployEntity's idempotency fast path.
const FINALIZE_POINTER_CONFLICT_RETRIES = 3
const FINALIZE_POINTER_CONFLICT_DELAY_MS = 300
// The conflicting deployment is in flight, so it clears within seconds.
const POINTER_CONFLICT_RETRY_AFTER_SECONDS = 5
// A failed publication (e.g. a database blip) is retried by resending the last batch; only publication repeats.
const INTERNAL_ERROR_RETRY_AFTER_SECONDS = 5

// Caps the manifest on both paths: a resume reads it back from storage outside the multipart budget.
const MAX_ENTITY_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

// Expired uploads listed per page, and storage keys per exclusive delete batch.
const EXPIRED_UPLOADS_PER_PAGE = 100
const CLEANUP_DELETE_BATCH_SIZE = 1000

/**
 * Seconds a client should wait before retrying a partial-upload quota rejection that only expired-upload
 * cleanup can resolve (upload count, account or server staged bytes). Expired uploads stay charged until
 * a cleanup run reclaims them, so this is the next run once the oldest charged upload has expired: the
 * next run if it already has, else the first run after it expires. Runs are `cleanupIntervalMs` apart,
 * counted from the last one; before any run, from now. At least 1 s.
 * @param params Current time, the oldest charged upload's creation (undefined if none), the upload
 * lifetime, and the cleanup schedule (all epoch ms / ms).
 * @returns The Retry-After seconds.
 */
export function secondsUntilCleanupFreesQuota(params: {
  now: number
  oldestCreatedAt: number | undefined
  ttlMs: number
  lastCleanupAt: number | undefined
  cleanupIntervalMs: number
}): number {
  const { now, oldestCreatedAt, ttlMs, lastCleanupAt, cleanupIntervalMs } = params
  const reclaimableAt = oldestCreatedAt === undefined ? now : Math.max(now, oldestCreatedAt + ttlMs)
  const base = lastCleanupAt ?? now
  const runs = Math.max(1, Math.ceil((reclaimableAt - base) / cleanupIntervalMs))
  return Math.max(1, Math.ceil((base + runs * cleanupIntervalMs - now) / 1000))
}

/** A per-pointer upload cap an upload would exceed. */
export type PointerQuotaRejection = {
  reason: Extract<PartialUploadThrottleReason, 'uploads_per_pointer' | 'uploads_per_pointer_account'>
  message: string
  retryAfterSeconds: number
}

/**
 * Checks a new upload against the per-pointer caps: each of its pointers may be held by at most
 * `maxUploadsPerPointer` live uploads across deployers, and by at most all but one of them (at least 1)
 * of one deployer. Live uploads free their slots when they expire, so Retry-After is when every full
 * pointer's oldest upload in scope expires; at least 1 s.
 * @param params Live usage of the upload's pointers, the cap, current time and upload lifetime (ms).
 * @returns The rejection, or undefined when the upload fits.
 */
export function checkPointerQuotas(params: {
  usage: PointerUsage[]
  maxUploadsPerPointer: number
  now: number
  ttlMs: number
}): PointerQuotaRejection | undefined {
  const { usage, maxUploadsPerPointer, now, ttlMs } = params
  const maxPerDeployer = Math.max(1, maxUploadsPerPointer - 1)
  const retryAfter = (oldest: number[]) => Math.max(1, Math.ceil((Math.max(...oldest) + ttlMs - now) / 1000))
  const describe = (full: PointerUsage[]) =>
    full
      .slice(0, 5)
      .map((entry) => entry.pointer)
      .join(' ') + (full.length > 5 ? ` and ${full.length - 5} more` : '')

  const full = usage.filter((entry) => entry.uploads >= maxUploadsPerPointer)
  if (full.length > 0) {
    return {
      reason: 'uploads_per_pointer',
      message: `Too many partial uploads in progress for parcels ${describe(
        full
      )} (max ${maxUploadsPerPointer} per parcel). Complete an upload or wait for one to expire.`,
      retryAfterSeconds: retryAfter(full.map((entry) => entry.oldestCreatedAt))
    }
  }
  const ownFull = usage.filter((entry) => entry.deployerUploads >= maxPerDeployer)
  if (ownFull.length > 0) {
    return {
      reason: 'uploads_per_pointer_account',
      message: `Too many partial uploads in progress for this account on parcels ${describe(
        ownFull
      )} (max ${maxPerDeployer} per parcel). Complete an upload or wait for one to expire.`,
      retryAfterSeconds: retryAfter(ownFull.map((entry) => entry.deployerOldestCreatedAt ?? now - ttlMs))
    }
  }
  return undefined
}

async function streamToBufferCapped(stream: AsyncIterable<Buffer>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    total += chunk.byteLength
    if (total > maxBytes) {
      throw new InvalidPartialDeploymentError([`The stored entity file is too large (over ${maxBytes} bytes).`])
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Stages authenticated, entity-keyed partial upload batches. Each batch is hashed and validated without
 * locks, then stored and possibly published under the shared content lock and the per-entity lock. Overlapping uploads
 * coexist within byte and count quotas, including a per-parcel cap across deployers; publication order is enforced by
 * the deploy pipeline.
 * @param components Validation, persistence, storage and telemetry dependencies.
 * @param options Tuning overrides; `expiredUploadsPerPage` is the cleanup listing page size (default 100).
 * @returns Partial deployment orchestration and expired-upload cleanup.
 * @throws Error when MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE can't fit a batch of the entity file and one maximum-size file.
 */
export function createPartialDeployments(
  components: Pick<
    AppComponents,
    | 'logs'
    | 'metrics'
    | 'env'
    | 'storage'
    | 'database'
    | 'crypto'
    | 'validator'
    | 'deployer'
    | 'entities'
    | 'deploymentsRepository'
    | 'pendingDeploymentsRepository'
    | 'contentFilesRepository'
    | 'contentLocks'
  >,
  options: { expiredUploadsPerPage?: number } = {}
): IPartialDeployments {
  const {
    logs,
    metrics,
    env,
    storage,
    database,
    crypto,
    validator,
    deployer,
    entities,
    deploymentsRepository,
    pendingDeploymentsRepository,
    contentFilesRepository,
    contentLocks
  } = components
  const logger = logs.getLogger('partial-deployments')
  const pendingDeploymentTtlMs = env.getConfig<number>(EnvironmentConfig.PENDING_DEPLOYMENT_TTL)
  const requestTtlBackwards = env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
  const maxPendingPerDeployer = env.getConfig<number>(EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER)
  const maxUploadsPerPointer = env.getConfig<number>(EnvironmentConfig.MAX_PENDING_UPLOADS_PER_POINTER)
  const accountBytes = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER))
  const globalBytes = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PENDING_BYTES))
  const bytesPerMinute = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE))
  // A file can't be split across batches, so a smaller rate would make some valid scenes impossible to upload.
  const minBytesPerMinute =
    BigInt(env.getConfig<number>(EnvironmentConfig.MAX_UPLOAD_FILE_SIZE)) + BigInt(MAX_ENTITY_FILE_SIZE_BYTES)
  if (bytesPerMinute < minBytesPerMinute) {
    throw new Error(
      `MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE (${bytesPerMinute}) must fit a batch of the entity file (up to ${MAX_ENTITY_FILE_SIZE_BYTES} bytes) and one MAX_UPLOAD_FILE_SIZE file: at least ${minBytesPerMinute}.`
    )
  }
  const cleanupIntervalMs = env.getConfig<number>(EnvironmentConfig.PENDING_DEPLOYMENTS_CLEANUP_INTERVAL)
  const expiredUploadsPerPage = options.expiredUploadsPerPage ?? EXPIRED_UPLOADS_PER_PAGE
  // When the last cleanup run ended, to estimate the next one for Retry-After.
  let lastCleanupAt: number | undefined
  metrics.observe('dcl_partial_upload_capacity_bytes', {}, Number(globalBytes))

  async function timed<T>(stage: PartialUploadStage, operation: () => Promise<T>): Promise<T> {
    const { end } = metrics.startTimer('dcl_partial_upload_stage_duration_seconds', { stage })
    try {
      return await operation()
    } finally {
      end()
    }
  }

  function isLive(row: PendingDeploymentRow): boolean {
    return Date.now() <= row.createdAt.getTime() + pendingDeploymentTtlMs
  }

  const expired = () =>
    new InvalidPartialDeploymentError(['This upload expired. Create a new entity with a fresh timestamp.'])

  // Re-checked before every step that stores or publishes, since a batch admitted just before expiry
  // could otherwise finish after it, once garbage collection no longer counts its content as pending.
  function assertLiveUntil(expiresAt: number): void {
    if (Date.now() > expiresAt) {
      throw expired()
    }
  }

  // Stores a batch, aborting the writes still running when the upload expires.
  async function storeUntil(files: Map<string, Uint8Array>, expiresAt: number): Promise<void> {
    assertLiveUntil(expiresAt)
    const signal = AbortSignal.timeout(Math.max(expiresAt - Date.now(), 0))
    try {
      await storeStreamsInBatches(storage, Array.from(files), signal)
    } catch (error) {
      if (signal.aborted) {
        throw expired()
      }
      throw error
    }
  }

  // A 429 for a quota that frees when cleanup reclaims the oldest upload in scope.
  async function quotaExceeded(
    db: DatabaseClient,
    message: string,
    scope: OldestUploadScope,
    reason: PartialUploadThrottleReason
  ) {
    const retryAfterSeconds = secondsUntilCleanupFreesQuota({
      now: Date.now(),
      oldestCreatedAt: await pendingDeploymentsRepository.getOldestCreatedAt(db, scope),
      ttlMs: pendingDeploymentTtlMs,
      lastCleanupAt,
      cleanupIntervalMs
    })
    return new InvalidPartialDeploymentError([message], 429, retryAfterSeconds, reason)
  }

  // A resumable answer tells the client to keep uploading, so it is only given while the upload is live.
  function incompleteUntil(missing: string[], expiresAt: number): StageDeploymentResult {
    assertLiveUntil(expiresAt)
    return { kind: 'incomplete', missing }
  }

  async function inventory(hashes: string[]) {
    metrics.increment('dcl_partial_upload_metadata_checks_total', {}, hashes.length)
    return storage.fileInfoMultiple(hashes)
  }

  async function deletePendingBestEffort(entityId: string): Promise<void> {
    // Only called once the entity is confirmed deployed; covers the idempotent fast path, which skips
    // the delete that tx_deploy_entity performs.
    try {
      await pendingDeploymentsRepository.deleteByEntityId(database, entityId)
    } catch (error: any) {
      logger.warn('Failed to delete pending deployment after finalize; cleanup will reclaim it', {
        entityId,
        error: error?.message ?? `${error}`
      })
    }
  }

  async function markMissing(entityId: string, hashes: string[]): Promise<void> {
    await pendingDeploymentsRepository.markMissing(database, entityId, hashes)
  }

  // Drops an upload that can never be published, with its accounting, so it stops holding quota until expiry.
  async function releaseUpload(entityId: string, released: ReleasedUpload): Promise<void> {
    try {
      const stagedKeys = await pendingDeploymentsRepository.getStagedKeys(database, entityId)
      // One statement: the row and its receipts (by cascade) go together.
      await pendingDeploymentsRepository.deleteByEntityId(database, entityId)
      released.stagedKeys = stagedKeys
      logger.info('Released a partial upload that can never be published', { entityId })
    } catch (error) {
      // The rejection stands; expired-upload cleanup reclaims the upload instead.
      logger.warn('Failed to release a partial upload that can never be published', {
        entityId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async function finalize(
    entity: Entity,
    entityFile: Uint8Array,
    authChain: StageDeploymentInput['authChain'],
    contentHashes: string[],
    admittedAt: number,
    batches: number,
    released: ReleasedUpload
  ): Promise<StageDeploymentResult> {
    const expiresAt = admittedAt + pendingDeploymentTtlMs
    assertLiveUntil(expiresAt)
    const entityId = entity.id
    // The deploy pipeline re-reads content from storage, so only the entity file needs to be in the map.
    const finalizeFiles = new Map<string, Uint8Array>([[entityId, entityFile]])
    for (let attempt = 0; ; attempt++) {
      // A retry after a pointer conflict may find the entity published by the request it conflicted with.
      if (attempt > 0) {
        const publishedMeanwhile = await deploymentsRepository.getEntityById(database, entityId)
        if (publishedMeanwhile) {
          await deletePendingBestEffort(entityId)
          return { kind: 'replayed', creationTimestamp: publishedMeanwhile.localTimestamp }
        }
      }
      // Freshness is measured from the upload's admission, as when staging it.
      const result = await deployer.deployEntity(finalizeFiles, entityId, { authChain }, DeploymentContext.LOCAL, {
        requestTtlAnchor: admittedAt,
        mustCommitBy: expiresAt
      })
      if (!isInvalidDeployment(result)) {
        metrics.increment('dcl_partial_uploads_completed_total')
        metrics.observe('dcl_partial_upload_duration_seconds', {}, (Date.now() - admittedAt) / 1000)
        metrics.observe('dcl_partial_upload_batches_per_upload', {}, batches)
        await deletePendingBestEffort(entityId)
        return { kind: 'deployed', creationTimestamp: result }
      }
      const isPointerConflict = result.kind === 'pointer-conflict'
      if (isPointerConflict && attempt < FINALIZE_POINTER_CONFLICT_RETRIES) {
        await sleep(FINALIZE_POINTER_CONFLICT_DELAY_MS)
        continue
      }

      // A concurrent finalize won, possibly in another process whose duplicate insert failed here.
      const alreadyDeployed = await deploymentsRepository.getEntityById(database, entityId)
      if (alreadyDeployed) {
        await deletePendingBestEffort(entityId)
        return { kind: 'replayed', creationTimestamp: alreadyDeployed.localTimestamp }
      }

      // Content went missing while the pipeline ran: resumable, the client re-uploads it.
      const present = await storage.existMultiple(contentHashes)
      const missingNow = contentHashes.filter((hash) => !present.get(hash))
      if (missingNow.length > 0) {
        await markMissing(entityId, missingNow)
        return incompleteUntil(missingNow, expiresAt)
      }

      // A server failure says nothing about the entity: the upload stays staged for the client's retry.
      if (result.kind === 'internal-error') {
        throw new PartialDeploymentUnavailableError(result.errors, INTERNAL_ERROR_RETRY_AFTER_SECONDS)
      }
      // Only a rejection by the rate limit itself is retryable: a newer entity on the pointers never clears.
      if (result.kind === 'rate-limited') {
        throw new InvalidPartialDeploymentError(
          result.errors,
          429,
          deployer.getRateLimitRetryAfterSeconds(entity.type, entity.pointers),
          'entity_rate_limit'
        )
      }
      if (isPointerConflict) {
        throw new InvalidPartialDeploymentError(
          result.errors,
          429,
          POINTER_CONFLICT_RETRY_AFTER_SECONDS,
          'pointer_conflict'
        )
      }
      // Newer entity, lost access, too big, invalid or expired: retrying can't help.
      await releaseUpload(entityId, released)
      throw new InvalidPartialDeploymentError(result.errors)
    }
  }

  async function readBackEntityFile(
    entityId: string,
    authChain: StageDeploymentInput['authChain']
  ): Promise<Uint8Array> {
    const mustInclude = new InvalidPartialDeploymentError([
      `The first partial request for an entity, and any request by another signer, must include the entity file '${entityId}'.`
    ])
    // The read-back is outside the multipart byte budget, so gate it before any storage I/O: a locally
    // valid signature (any key can sign any id) AND a live upload created by this same signer.
    const signature = await crypto.validateSignature(entityId, authChain, Date.now())
    if (!signature.ok) {
      throw mustInclude
    }
    const pending = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    if (
      !pending ||
      !isLive(pending) ||
      pending.deployerAddress !== Authenticator.ownerAddress(authChain).toLowerCase()
    ) {
      throw mustInclude
    }
    const stored = await storage.retrieve(entityId)
    if (!stored) {
      throw mustInclude
    }
    const entityFile = await streamToBufferCapped(await stored.asStream(), MAX_ENTITY_FILE_SIZE_BYTES)
    const [{ hash }] = await crypto.calculateIPFSHashes([entityFile])
    if (hash !== entityId) {
      logger.warn('The stored entity file of a partial upload does not match its id', { entityId, computed: hash })
      // Unrecorded, so the entity file the client resends is written over the corrupt copy.
      await markMissing(entityId, [entityId])
      throw mustInclude
    }
    return entityFile
  }

  // Creates the upload unless it exists and returns when it was created. One seen earlier in this request
  // must still exist: only cleanup of an expired upload removes it, and re-creating it would restart its
  // lifetime. A new upload is only inserted while its lifetime, anchored at `requestedAt`, is still running.
  async function createUpload(
    entity: Entity,
    contentHashes: string[],
    deployerAddress: string,
    seen: PendingDeploymentRow | undefined,
    requestedAt: number
  ): Promise<number> {
    let createdAt = requestedAt
    await database.transaction(async (tx) => {
      await pendingDeploymentsRepository.acquireDeployerLock(tx, deployerAddress)
      const existing = await pendingDeploymentsRepository.getByEntityId(tx, entity.id)
      if (seen && !existing) {
        throw expired()
      }
      if (existing) {
        if (!isLive(existing)) {
          throw expired()
        }
        // Reservations are charged to the upload's creator, so nobody else may add batches to it.
        if (existing.deployerAddress !== deployerAddress) {
          throw new InvalidPartialDeploymentError(['This upload was started by another account.'])
        }
        createdAt = existing.createdAt.getTime()
        return
      }
      if ((await pendingDeploymentsRepository.countByDeployer(tx, deployerAddress)) >= maxPendingPerDeployer) {
        throw await quotaExceeded(
          tx,
          `Too many partial uploads in progress for this account (max ${maxPendingPerDeployer}). Complete an upload or wait for expired uploads to be cleaned up.`,
          { deployerAddress },
          'uploads_per_account'
        )
      }
      // Bounds what any set of parcels can stage, however many accounts may deploy to them.
      await pendingDeploymentsRepository.acquirePointerLocks(tx, entity.pointers)
      const pointerRejection = checkPointerQuotas({
        usage: await pendingDeploymentsRepository.getLivePointerUsage(
          tx,
          entity.pointers,
          deployerAddress,
          pendingDeploymentTtlMs
        ),
        maxUploadsPerPointer,
        now: Date.now(),
        ttlMs: pendingDeploymentTtlMs
      })
      if (pointerRejection) {
        throw new InvalidPartialDeploymentError(
          [pointerRejection.message],
          429,
          pointerRejection.retryAfterSeconds,
          pointerRejection.reason
        )
      }
      // A delayed first batch (slow parsing, validation or lock waits) may arrive already past its deadline.
      assertLiveUntil(createdAt + pendingDeploymentTtlMs)
      await pendingDeploymentsRepository.insert(tx, {
        entityId: entity.id,
        entityType: entity.type,
        pointers: entity.pointers,
        contentHashes,
        deployerAddress,
        createdAt
      })
    }, 'tx_create_pending_deployment')
    return createdAt
  }

  async function reserve(
    entityId: string,
    receipts: FileReceipt[],
    maxSceneBytes: bigint,
    incomingBytes: number,
    expiresAt: number
  ): Promise<void> {
    const upload = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    if (!upload) {
      throw new InvalidPartialDeploymentError(['Upload no longer exists; resend its manifest.'])
    }
    // Nothing is charged to an upload past its deadline.
    assertLiveUntil(expiresAt)
    // Committed on its own, before admission: the batch was received and processed even if it is then
    // rejected, so repeating rejected batches can't escape the rate limit.
    const rateWindow = await pendingDeploymentsRepository.addIncomingBytes(
      database,
      upload.deployerAddress,
      incomingBytes
    )
    // No window can ever admit this batch, so retrying it can't help.
    if (BigInt(incomingBytes) > bytesPerMinute) {
      throw new InvalidPartialDeploymentError([
        `This batch is ${incomingBytes} bytes, over the partial upload byte rate limit of ${bytesPerMinute} bytes per minute. Send it in smaller batches.`
      ])
    }
    if (rateWindow.bytes > bytesPerMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil(rateWindow.endsInMs / 1000))
      throw new InvalidPartialDeploymentError(
        [
          `Partial upload byte rate exceeded for this account: ${rateWindow.bytes} bytes in the current one-minute window, max ${bytesPerMinute}. Retry in ${retryAfterSeconds} s.`
        ],
        429,
        retryAfterSeconds,
        'bytes_per_minute'
      )
    }
    await database.transaction(async (tx) => {
      // One short global critical section makes both aggregate budgets atomic; no storage I/O under it.
      await pendingDeploymentsRepository.acquireBudgetLock(tx)
      assertLiveUntil(expiresAt)
      await pendingDeploymentsRepository.upsertFileReceipts(tx, entityId, receipts)
      await pendingDeploymentsRepository.refreshReservedBytes(tx, entityId)
      const totals = await pendingDeploymentsRepository.getReservationTotals(tx, entityId, upload.deployerAddress)
      if (totals.scene > maxSceneBytes) {
        throw new InvalidPartialDeploymentError(['Deployment failed: The deployment is too big.'])
      }
      // An upload larger than a budget on its own never fits, however much the others free.
      const uploadBudget = accountBytes < globalBytes ? accountBytes : globalBytes
      if (totals.upload > uploadBudget) {
        const limit = accountBytes < globalBytes ? 'per-account' : 'server'
        throw new InvalidPartialDeploymentError([
          `This upload needs ${totals.upload} bytes of partial upload storage, over the ${limit} budget of ${uploadBudget} bytes.`
        ])
      }
      if (totals.account > accountBytes) {
        throw await quotaExceeded(
          tx,
          `Partial upload storage budget exceeded for this account: ${totals.account} bytes staged with this batch, max ${accountBytes}. Complete uploads or wait for cleanup.`,
          { deployerAddress: upload.deployerAddress },
          'bytes_per_account'
        )
      }
      if (totals.total > globalBytes) {
        throw await quotaExceeded(
          tx,
          'Partial upload storage on this server is full. Retry later.',
          {},
          'bytes_per_server'
        )
      }
      metrics.observe('dcl_partial_upload_reserved_bytes', {}, Number(totals.total))
    }, 'tx_reserve_pending_deployment')
  }

  async function stageDeployment(input: StageDeploymentInput): Promise<StageDeploymentResult> {
    const prepared = await prepareBatch(input)
    if ('kind' in prepared) {
      return prepared
    }
    // Hashing and validation above hold no lock connection; storage and publication below do.
    const lockWait = metrics.startTimer('dcl_partial_upload_stage_duration_seconds', { stage: 'lock_wait' })
    let waiting = true
    const endLockWait = () => {
      if (waiting) {
        waiting = false
        lockWait.end()
      }
    }
    const released: ReleasedUpload = {}
    try {
      return await contentLocks.withRead(() => {
        endLockWait()
        return commitBatch(prepared, released)
      }, input.entityId)
    } catch (error) {
      // A concurrent final batch may have held the entity's lock while publishing it.
      if (error instanceof EntityLockTimeoutError) {
        const deployed = await deploymentsRepository.getEntityById(database, input.entityId)
        if (deployed) {
          return { kind: 'replayed', creationTimestamp: deployed.localTimestamp }
        }
      }
      throw error
    } finally {
      endLockWait()
      reclaimReleased(input.entityId, released)
    }
  }

  // Releases an upload found doomed before taking the locks, under its entity's lock like any batch.
  async function releaseUnlocked(entityId: string): Promise<void> {
    const released: ReleasedUpload = {}
    try {
      await contentLocks.withRead(() => releaseUpload(entityId, released), entityId)
    } catch (error) {
      // Busy: expired-upload cleanup reclaims it instead.
      if (!(error instanceof EntityLockTimeoutError)) throw error
    }
    reclaimReleased(entityId, released)
  }

  // Not awaited: the exclusive lock may wait for in-flight deployments, and the answer doesn't depend on it.
  function reclaimReleased(entityId: string, { stagedKeys }: ReleasedUpload): void {
    if (stagedKeys) {
      void deleteOrphanedStagedKeys(entityId, stagedKeys).catch((error) => {
        // Left to the unreferenced-files sweep.
        logger.warn('Failed to delete the staged content of a released partial upload', {
          entityId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    }
  }

  // Everything that depends only on the request and slow-changing state, run outside the content lock.
  async function prepareBatch({
    entityId,
    authChain,
    files,
    requestedAt,
    onAdmitted
  }: StageDeploymentInput): Promise<PreparedBatch | StageDeploymentResult> {
    // Completion replay: a deployed entity is never deployed again.
    const alreadyDeployed = await deploymentsRepository.getEntityById(database, entityId)
    if (alreadyDeployed) {
      return { kind: 'replayed', creationTimestamp: alreadyDeployed.localTimestamp }
    }

    if (!IPFSv2.validate(entityId)) {
      throw new InvalidPartialDeploymentError([
        `The entity id '${entityId}' is not a valid IPFS v2 hash. Partial deployments require IPFS v2 entities.`
      ])
    }

    // In partial mode the field-name keys are load-bearing, so every file must hash to its key.
    const entries = Array.from(files.entries())
    const hashed = await timed('hash', () => crypto.calculateIPFSHashes(entries.map(([, buf]) => buf)))
    const uploadedFiles = new Map<string, Uint8Array>()
    for (let i = 0; i < entries.length; i++) {
      const declaredKey = entries[i][0]
      const computedHash = hashed[i].hash
      if (declaredKey !== computedHash) {
        throw new InvalidPartialDeploymentError([
          `The uploaded file '${declaredKey}' does not match its content hash (computed ${computedHash}).`
        ])
      }
      uploadedFiles.set(computedHash, hashed[i].file)
    }

    let entityFile = uploadedFiles.get(entityId)
    if (entityFile) {
      if (entityFile.byteLength > MAX_ENTITY_FILE_SIZE_BYTES) {
        throw new InvalidPartialDeploymentError([
          `The entity file '${entityId}' is too large (${entityFile.byteLength} bytes, max ${MAX_ENTITY_FILE_SIZE_BYTES}).`
        ])
      }
    } else {
      entityFile = await readBackEntityFile(entityId, authChain)
    }

    let entity: Entity
    try {
      entity = entities.parse(entityFile, entityId)
    } catch (error) {
      throw new InvalidPartialDeploymentError([`There was a problem parsing the entity: ${error}`])
    }
    if (entity.type !== EntityType.SCENE) {
      throw new InvalidPartialDeploymentError([
        `Partial deployments are only supported for scenes, but the entity type is '${entity.type}'.`
      ])
    }
    if (!entity.pointers || entity.pointers.length === 0) {
      throw new InvalidPartialDeploymentError(['The entity does not have any pointer.'])
    }

    const deployerAddress = Authenticator.ownerAddress(authChain).toLowerCase()
    const pending = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    if (pending && !isLive(pending)) {
      throw expired()
    }

    // Resume batches by the upload's creator skip the slow access check: creating the upload passed
    // it, bytes are hash-verified against the manifest, and finalize re-runs the full validation.
    const isResumeBySameDeployer = !!pending && pending.deployerAddress === deployerAddress
    const validationResult = await timed('validate', () =>
      validator.validateStagingScene(
        { entity, files: uploadedFiles, auditInfo: { authChain } },
        { skipAccessCheck: isResumeBySameDeployer }
      )
    )
    if (!validationResult.ok) {
      throw new InvalidPartialDeploymentError(validationResult.errors ?? ['The staging validation was not successful.'])
    }

    // Fast-fail for new uploads only; the deploy pipeline enforces ordering at publication.
    const newerEntity = () => new InvalidPartialDeploymentError([newerEntityMessage(entity)])
    if (!pending && (await deploymentsRepository.hasNewerDeploymentOnPointers(database, entity))) {
      throw newerEntity()
    }
    if (deployer.isRateLimited(entity.type, entity.pointers)) {
      // The deployment holding the limit may be a newer entity that overtook this upload, which never clears.
      if (pending && (await deploymentsRepository.hasNewerDeploymentOnPointers(database, entity))) {
        await releaseUnlocked(entityId)
        throw newerEntity()
      }
      throw new InvalidPartialDeploymentError(
        [`Entity rate limited (entityId=${entity.id} pointers=${entity.pointers.join(',')}).`],
        429,
        deployer.getRateLimitRetryAfterSeconds(entity.type, entity.pointers),
        'entity_rate_limit'
      )
    }
    // Freshness and the upload's lifetime are measured from its first request's arrival.
    const ttlAnchor = pending ? pending.createdAt.getTime() : requestedAt
    if (ttlAnchor - entity.timestamp > requestTtlBackwards) {
      throw new InvalidPartialDeploymentError([
        `The request is not recent enough, please submit it again with a new timestamp (entityId=${entity.id}).`
      ])
    }
    if (Date.now() - entity.timestamp < -REQUEST_TTL_FORWARDS) {
      throw new InvalidPartialDeploymentError([
        `The request is too far in the future, please submit it again with a new timestamp (entityId=${entity.id}).`
      ])
    }

    const contentHashes = Array.from(new Set((entity.content ?? []).map((c) => c.hash)))
    const maxSceneBytes =
      BigInt(validator.getMaxSizeInBytesPerPointer(EntityType.SCENE)) * BigInt(entity.pointers.length)
    return {
      entity,
      entityFile,
      authChain,
      uploadedFiles,
      deployerAddress,
      contentHashes,
      maxSceneBytes,
      seen: pending,
      requestedAt,
      onAdmitted
    }
  }

  // Runs under the shared content lock and the entity's lock, so batches of one upload are serialized.
  async function commitBatch(
    {
      entity,
      entityFile,
      authChain,
      uploadedFiles,
      deployerAddress,
      contentHashes,
      maxSceneBytes,
      seen,
      requestedAt,
      onAdmitted
    }: PreparedBatch,
    released: ReleasedUpload
  ): Promise<StageDeploymentResult> {
    const entityId = entity.id
    // Another batch may have published the entity since this one was prepared.
    const alreadyDeployed = await deploymentsRepository.getEntityById(database, entityId)
    if (alreadyDeployed) {
      return { kind: 'replayed', creationTimestamp: alreadyDeployed.localTimestamp }
    }
    const pending = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    if (seen && !pending) {
      throw expired()
    }

    // One inventory of already-stored content per upload; later batches rely on receipts.
    const receipts = new Map<string, FileReceipt>()
    const alreadyStored = new Set(
      pending ? (await pendingDeploymentsRepository.getStoredFiles(database, entityId)).keys() : []
    )
    if (!pending?.initialized) {
      const infos = await timed('inventory', () => inventory(contentHashes))
      const sizes = new Map<string, number>()
      for (const [hash, info] of infos) {
        if (info === undefined) {
          continue
        }
        if (info.contentSize == null) {
          // The finalize size validation would fail on it; fail before the whole scene is uploaded.
          throw new InvalidPartialDeploymentError([
            `Couldn't determine the size of the already-stored content file: ${hash}`
          ])
        }
        sizes.set(hash, info.contentSize)
      }
      // Only published content is free; content held just by pending uploads is charged as if received.
      const published = await contentFilesRepository.findPublishedHashes(database, Array.from(sizes.keys()))
      for (const [hash, size] of sizes) {
        receipts.set(hash, { hash, size, stored: true, charged: !published.has(hash) })
        alreadyStored.add(hash)
      }
    }
    // Every received byte counts toward the rate; already-stored files aren't rewritten, their receipts set the charge.
    let incomingBytes = 0
    const filesToStore = new Map<string, Uint8Array>()
    for (const [hash, file] of uploadedFiles) {
      incomingBytes += file.byteLength
      if (alreadyStored.has(hash)) {
        continue
      }
      receipts.set(hash, { hash, size: file.byteLength, stored: false, charged: true })
      filesToStore.set(hash, file)
    }
    const knownSceneBytes = Array.from(receipts.values())
      .filter((receipt) => receipt.hash !== entityId)
      .reduce((sum, receipt) => sum + BigInt(receipt.size), 0n)
    if (knownSceneBytes > maxSceneBytes) {
      throw new InvalidPartialDeploymentError(['Deployment failed: The deployment is too big.'])
    }

    const createdAt = await timed('accounting', async () => {
      const created = await createUpload(entity, contentHashes, deployerAddress, seen ?? pending, requestedAt)
      onAdmitted?.()
      try {
        await reserve(
          entityId,
          Array.from(receipts.values()),
          maxSceneBytes,
          incomingBytes,
          created + pendingDeploymentTtlMs
        )
      } catch (error) {
        // A first batch that isn't admitted must not keep its new upload holding a slot of the cap.
        if (!pending) await pendingDeploymentsRepository.deleteUnadmitted(database, entityId).catch(() => undefined)
        throw error
      }
      return created
    })
    const expiresAt = createdAt + pendingDeploymentTtlMs
    if (!pending) {
      metrics.increment('dcl_partial_uploads_started_total')
    }

    await timed('store', () => storeUntil(filesToStore, expiresAt))
    // A write that outlived the upload is left unrecorded; cleanup reclaims it with the upload's receipts.
    let batches = 0
    const progress = await timed('progress', async () => {
      await database.transaction(async (tx) => {
        if (!(await pendingDeploymentsRepository.markInitializedIfLive(tx, entityId, pendingDeploymentTtlMs))) {
          throw expired()
        }
        await pendingDeploymentsRepository.markStored(tx, entityId, Array.from(filesToStore.keys()))
        batches = await pendingDeploymentsRepository.countBatch(tx, entityId)
      }, 'tx_record_pending_deployment_progress')
      return pendingDeploymentsRepository.getStoredFiles(database, entityId)
    })
    const missing = contentHashes.filter((hash) => !progress.has(hash))
    metrics.increment('dcl_partial_upload_batches_total', { outcome: missing.length ? 'incomplete' : 'finalizing' })
    if (missing.length > 0) {
      return incompleteUntil(missing, expiresAt)
    }

    // One full verification at completion; the shared content lock keeps GC out until publication.
    const presentInfos = await timed('finalize_verify', () => inventory(contentHashes))
    const nowMissing = contentHashes.filter((hash) => presentInfos.get(hash) === undefined)
    if (nowMissing.length > 0) {
      await markMissing(entityId, nowMissing)
      return incompleteUntil(nowMissing, expiresAt)
    }

    return await timed('finalize_deploy', () =>
      finalize(entity, entityFile, authChain, contentHashes, createdAt, batches, released)
    )
  }

  async function cleanupExpired(): Promise<ExpiredCleanupSummary> {
    const { end } = metrics.startTimer('dcl_partial_upload_cleanup_duration_seconds')
    let outcome: ExpiredCleanupSummary['outcome'] = 'error'
    try {
      const summary = await reclaimExpired()
      outcome = summary.outcome
      if (outcome === 'success') {
        metrics.observe('dcl_partial_upload_cleanup_last_success_timestamp_seconds', {}, Date.now() / 1000)
      }
      return summary
    } finally {
      end()
      metrics.increment('dcl_partial_upload_cleanup_runs_total', { outcome })
      lastCleanupAt = Date.now()
    }
  }

  // Deletes the keys no published content or live upload references, under the exclusive content lock.
  async function deleteOrphanedStagedKeys(entityId: string, keys: string[]): Promise<void> {
    for (let offset = 0; offset < keys.length; offset += CLEANUP_DELETE_BATCH_SIZE) {
      const batch = keys.slice(offset, offset + CLEANUP_DELETE_BATCH_SIZE)
      await contentLocks.withWrite(async () => {
        const referenced = await contentFilesRepository.findReferencedHashes(database, batch, pendingDeploymentTtlMs)
        const orphaned = batch.filter((hash) => !referenced.has(hash))
        if (orphaned.length > 0) {
          try {
            await storage.delete(orphaned)
          } catch (error) {
            throw new StagedContentDeleteError(entityId, error)
          }
        }
      })
    }
  }

  // Deletes an expired upload's unreferenced staged content, then releases its accounting.
  async function reclaimUpload(entityId: string): Promise<void> {
    // Accounting is released only after every physical delete batch succeeds.
    await deleteOrphanedStagedKeys(entityId, await pendingDeploymentsRepository.getStagedKeys(database, entityId))
    await pendingDeploymentsRepository.deleteExpiredByEntityId(database, entityId, pendingDeploymentTtlMs)
  }

  async function reclaimExpired(): Promise<ExpiredCleanupSummary> {
    let removed = 0
    let failed = 0
    let deferred = false
    try {
      let after: ExpiredUpload | undefined
      // Keyset paging visits every expired upload once per run, moving past the ones that fail.
      while (!deferred) {
        const expired = await pendingDeploymentsRepository.listExpired(
          database,
          pendingDeploymentTtlMs,
          expiredUploadsPerPage,
          after
        )
        for (const upload of expired) {
          try {
            await reclaimUpload(upload.entityId)
            removed++
          } catch (error) {
            // Busy with deployments: the rest stays charged and is retried on the next run.
            if (error instanceof EntityLockTimeoutError) {
              deferred = true
              break
            }
            failed++
            const reason = error instanceof StagedContentDeleteError ? 'storage' : 'database'
            metrics.increment('dcl_partial_upload_cleanup_failures_total', { reason })
            logger.error('Failed to reclaim an expired partial upload; retrying it next run', {
              entityId: upload.entityId,
              reason,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
        if (expired.length < expiredUploadsPerPage) {
          break
        }
        after = expired[expired.length - 1]
      }
      if (deferred) {
        logger.warn(
          `Expired-upload cleanup deferred after ${removed} upload(s): deployments kept the content lock busy`
        )
      }
    } finally {
      await pendingDeploymentsRepository.deleteElapsedRateWindows(database)
      const totals = await pendingDeploymentsRepository.getStagingTotals(database, pendingDeploymentTtlMs)
      metrics.observe('dcl_partial_upload_reserved_bytes', {}, totals.total)
      metrics.observe('dcl_partial_upload_cleanup_backlog_bytes', {}, totals.expired)
      metrics.observe('dcl_partial_uploads_pending', { state: 'live' }, totals.liveUploads)
      metrics.observe('dcl_partial_uploads_pending', { state: 'expired' }, totals.expiredUploads)
      if (removed > 0) {
        metrics.increment('dcl_pending_deployments_expired_total', {}, removed)
        logger.info(`Reclaimed ${removed} expired pending deployment(s)`)
      }
    }
    // A failed upload outranks a deferral: it won't clear by waiting for the lock.
    const outcome = failed > 0 ? 'error' : deferred ? 'deferred' : 'success'
    return { removed, failed, outcome }
  }

  async function isLiveUploadOf(entityId: string, deployerAddress: string): Promise<boolean> {
    const pending = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    return !!pending && isLive(pending) && pending.deployerAddress === deployerAddress.toLowerCase()
  }

  return { stageDeployment, cleanupExpired, isLiveUploadOf }
}
