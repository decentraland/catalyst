import { Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { hashV1 } from '@dcl/hashing'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { EntityLockTimeoutError } from '../../adapters/content-locks'
import { FileReceipt, OldestUploadScope, PendingDeploymentRow } from '../../adapters/pending-deployments-repository'
import { DatabaseClient } from '../../adapters/database'
import { UploadBudgetExceededError, UploadBudgetLease } from '../../adapters/upload-budget'
import { EnvironmentConfig } from '../../Environment'
import { DeploymentContext, isInvalidDeployment } from '../../deployment-types'
import { AppComponents } from '../../types'
import { REQUEST_TTL_FORWARDS } from '../deployment-service/server-validator'
import { CONTENT_STORE_CONCURRENCY, storeStreamsInBatches } from '../store-content'
import { InvalidPartialDeploymentError, PartialUploadThrottleReason } from './errors'
import { IPartialDeployments, StagedFile, StageDeploymentInput, StageDeploymentResult } from './types'

// A batch whose request-only checks passed, ready to be stored under the content lock.
type PreparedBatch = {
  entity: Entity
  entityFile: Uint8Array
  authChain: StageDeploymentInput['authChain']
  uploadedFiles: Map<string, StagedFile>
  deployerAddress: string
  contentHashes: string[]
  maxSceneBytes: bigint
  /** The upload as it was when the batch was prepared, if it existed. */
  seen: PendingDeploymentRow | undefined
  requestedAt: number
}

// Bounded retry for two requests completing the same upload at once: the loser of the in-memory
// pointer lock retries and hits deployEntity's idempotency fast path.
const FINALIZE_POINTER_CONFLICT_RETRIES = 3
const FINALIZE_POINTER_CONFLICT_DELAY_MS = 300
// The conflicting deployment is in flight, so it clears within seconds.
const POINTER_CONFLICT_RETRY_AFTER_SECONDS = 5

// Caps the manifest on both paths: a resume reads it back from storage outside the multipart budget.
export const MAX_ENTITY_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const EMPTY_FILE = new Uint8Array(0)

// Expired uploads reclaimed per cleanup run, and storage keys per exclusive delete batch.
const EXPIRED_UPLOADS_PER_CLEANUP = 100
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

// Grows the memory share with the bytes read, so stored sizes (attacker-influenced when compressed) aren't trusted.
async function streamToBufferCapped(
  stream: AsyncIterable<Buffer>,
  maxBytes: number,
  lease: UploadBudgetLease
): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    total += chunk.byteLength
    if (total > maxBytes) {
      throw new InvalidPartialDeploymentError([`The stored entity file is too large (over ${maxBytes} bytes).`])
    }
    if (!lease.resize(total)) {
      throw new UploadBudgetExceededError()
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Stages authenticated, entity-keyed partial upload batches. Each batch is hashed and validated without
 * locks, then stored and possibly published under the shared content lock and the per-entity lock. Overlapping uploads
 * coexist within byte and count quotas; publication order is enforced by the deploy pipeline.
 * @param components Validation, persistence, storage and telemetry dependencies.
 * @returns Partial deployment orchestration and expired-upload cleanup.
 */
export function createPartialDeployments(
  components: Pick<
    AppComponents,
    | 'logs'
    | 'metrics'
    | 'env'
    | 'crypto'
    | 'storage'
    | 'database'
    | 'validator'
    | 'deployer'
    | 'entities'
    | 'deploymentsRepository'
    | 'pendingDeploymentsRepository'
    | 'contentFilesRepository'
    | 'contentLocks'
    | 'deploymentMemoryBudget'
  >
): IPartialDeployments {
  const {
    logs,
    metrics,
    env,
    crypto,
    storage,
    database,
    validator,
    deployer,
    entities,
    deploymentsRepository,
    pendingDeploymentsRepository,
    contentFilesRepository,
    contentLocks,
    deploymentMemoryBudget
  } = components
  const logger = logs.getLogger('partial-deployments')
  const pendingDeploymentTtlMs = env.getConfig<number>(EnvironmentConfig.PENDING_DEPLOYMENT_TTL)
  const requestTtlBackwards = env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
  const maxPendingPerDeployer = env.getConfig<number>(EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER)
  const accountBytes = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER))
  const globalBytes = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PENDING_BYTES))
  const bytesPerMinute = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE))
  const cleanupIntervalMs = env.getConfig<number>(EnvironmentConfig.PENDING_DEPLOYMENTS_CLEANUP_INTERVAL)
  // When the last cleanup run ended, to estimate the next one for Retry-After.
  let lastCleanupAt: number | undefined
  metrics.observe('dcl_partial_upload_capacity_bytes', {}, Number(globalBytes))

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
  async function storeUntil(files: Map<string, StagedFile>, expiresAt: number): Promise<void> {
    assertLiveUntil(expiresAt)
    const signal = AbortSignal.timeout(Math.max(expiresAt - Date.now(), 0))
    try {
      await storeStreamsInBatches(
        storage,
        Array.from(files, ([hash, file]) => [hash, () => file.openStream()]),
        signal
      )
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

  async function finalize(
    entity: Entity,
    entityFile: Uint8Array,
    authChain: StageDeploymentInput['authChain'],
    contentHashes: string[],
    admittedAt: number,
    batches: number
  ): Promise<StageDeploymentResult> {
    const expiresAt = admittedAt + pendingDeploymentTtlMs
    assertLiveUntil(expiresAt)
    const entityId = entity.id
    // The deploy pipeline re-reads content from storage, so only the entity file needs to be in the map.
    const finalizeFiles = new Map<string, Uint8Array>([[entityId, entityFile]])
    for (let attempt = 0; ; attempt++) {
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
        return { kind: 'deployed', creationTimestamp: alreadyDeployed.localTimestamp }
      }

      // Content went missing while the pipeline ran: resumable, the client re-uploads it.
      const present = await storage.existMultiple(contentHashes)
      const missingNow = contentHashes.filter((hash) => !present.get(hash))
      if (missingNow.length > 0) {
        await markMissing(entityId, missingNow)
        return incompleteUntil(missingNow, expiresAt)
      }

      // Catalyst-only transient conditions keep their retryable 429.
      if (deployer.isRateLimited(entity.type, entity.pointers)) {
        throw new InvalidPartialDeploymentError(
          result.errors,
          429,
          deployer.getRateLimitTtlSeconds(entity.type),
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
      throw new InvalidPartialDeploymentError(result.errors)
    }
  }

  // Reads the entity file back under a memory budget share handed to `hold`, which the caller releases.
  async function readBackEntityFile(
    entityId: string,
    authChain: StageDeploymentInput['authChain'],
    hold: (lease: UploadBudgetLease) => void
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
    const lease = deploymentMemoryBudget.acquire(0)
    hold(lease)
    const stored = await storage.retrieve(entityId)
    if (!stored) {
      throw mustInclude
    }
    // A file the budget can never hold is rejected outright rather than with a 503 it can't outwait.
    const maxBytes = Math.min(MAX_ENTITY_FILE_SIZE_BYTES, deploymentMemoryBudget.capacityBytes)
    return streamToBufferCapped(await stored.asStream(), maxBytes, lease)
  }

  // Creates the upload unless it exists and returns when it was created. One seen earlier in this request
  // must still exist: only cleanup of an expired upload removes it, and re-creating it would restart its
  // lifetime.
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
    incomingBytes: number
  ): Promise<void> {
    const upload = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    if (!upload) {
      throw new InvalidPartialDeploymentError(['Upload no longer exists; resend its manifest.'])
    }
    // Committed on its own, before admission: the batch was received and processed even if it is then
    // rejected, so repeating rejected batches can't escape the rate limit.
    const rateWindow = await pendingDeploymentsRepository.addIncomingBytes(
      database,
      upload.deployerAddress,
      incomingBytes
    )
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
      await pendingDeploymentsRepository.upsertFileReceipts(tx, entityId, receipts)
      await pendingDeploymentsRepository.refreshReservedBytes(tx, entityId)
      const totals = await pendingDeploymentsRepository.getReservationTotals(tx, entityId, upload.deployerAddress)
      if (totals.scene > maxSceneBytes) {
        throw new InvalidPartialDeploymentError(['Deployment failed: The deployment is too big.'])
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
    // A read-back entity file stays in memory, under its budget share, until the batch settles.
    const leases: UploadBudgetLease[] = []
    try {
      const prepared = await prepareBatch(input, (lease) => leases.push(lease))
      if ('kind' in prepared) {
        return prepared
      }
      // Hashing and validation above hold no lock connection; storage and publication below do.
      return await contentLocks.withRead(() => commitBatch(prepared), input.entityId)
    } finally {
      leases.forEach((lease) => lease.release())
    }
  }

  // Everything that depends only on the request and slow-changing state, run outside the content lock.
  async function prepareBatch(
    { entityId, authChain, files, entityFile: uploadedEntityBytes, requestedAt }: StageDeploymentInput,
    hold: (lease: UploadBudgetLease) => void
  ): Promise<PreparedBatch | StageDeploymentResult> {
    // Completion replay: a deployed entity is never deployed again.
    const alreadyDeployed = await deploymentsRepository.getEntityById(database, entityId)
    if (alreadyDeployed) {
      return { kind: 'deployed', creationTimestamp: alreadyDeployed.localTimestamp }
    }

    if (!IPFSv2.validate(entityId)) {
      throw new InvalidPartialDeploymentError([
        `The entity id '${entityId}' is not a valid IPFS v2 hash. Partial deployments require IPFS v2 entities.`
      ])
    }

    // In partial mode the field-name keys are load-bearing, so every file must hash to its key. Files are
    // hashed from their streams so a batch is never held in memory.
    const entries = Array.from(files.entries())
    for (let i = 0; i < entries.length; i += CONTENT_STORE_CONCURRENCY) {
      await Promise.all(
        entries.slice(i, i + CONTENT_STORE_CONCURRENCY).map(async ([declaredKey, file]) => {
          const computedHash = await hashV1(file.openStream())
          if (declaredKey !== computedHash) {
            throw new InvalidPartialDeploymentError([
              `The uploaded file '${declaredKey}' does not match its content hash (computed ${computedHash}).`
            ])
          }
        })
      )
    }
    const uploadedFiles: Map<string, StagedFile> = files

    let entityFile: Uint8Array
    const uploadedEntityFile = uploadedFiles.get(entityId)
    if (uploadedEntityFile) {
      if (uploadedEntityFile.size > MAX_ENTITY_FILE_SIZE_BYTES) {
        throw new InvalidPartialDeploymentError([
          `The entity file '${entityId}' is too large (${uploadedEntityFile.size} bytes, max ${MAX_ENTITY_FILE_SIZE_BYTES}).`
        ])
      }
      if (!uploadedEntityBytes) {
        throw new Error(`The entity file '${entityId}' was uploaded but not passed in memory.`)
      }
      entityFile = uploadedEntityBytes
    } else {
      entityFile = await readBackEntityFile(entityId, authChain, hold)
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
    // The staging validations only read which files were uploaded, not their bytes (size and content
    // checks run at finalize against storage), so content files are passed as empty placeholders.
    const stagingFiles = new Map<string, Uint8Array>(
      Array.from(uploadedFiles.keys(), (key) => [key, key === entityId ? entityFile : EMPTY_FILE])
    )
    const validationResult = await validator.validateStagingScene(
      { entity, files: stagingFiles, auditInfo: { authChain } },
      { skipAccessCheck: isResumeBySameDeployer }
    )
    if (!validationResult.ok) {
      throw new InvalidPartialDeploymentError(validationResult.errors ?? ['The staging validation was not successful.'])
    }

    // Fast-fail for new uploads only; the deploy pipeline enforces ordering at publication.
    if (!pending && (await deploymentsRepository.hasNewerDeploymentOnPointers(database, entity))) {
      throw new InvalidPartialDeploymentError([
        `There is a newer entity pointed by one or more of the pointers you provided (entityId=${entity.id}).`
      ])
    }
    if (deployer.isRateLimited(entity.type, entity.pointers)) {
      throw new InvalidPartialDeploymentError(
        [`Entity rate limited (entityId=${entity.id} pointers=${entity.pointers.join(',')}).`],
        429,
        deployer.getRateLimitTtlSeconds(entity.type),
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
      requestedAt
    }
  }

  // Runs under the shared content lock and the entity's lock, so batches of one upload are serialized.
  async function commitBatch({
    entity,
    entityFile,
    authChain,
    uploadedFiles,
    deployerAddress,
    contentHashes,
    maxSceneBytes,
    seen,
    requestedAt
  }: PreparedBatch): Promise<StageDeploymentResult> {
    const entityId = entity.id
    // Another batch may have published the entity since this one was prepared.
    const alreadyDeployed = await deploymentsRepository.getEntityById(database, entityId)
    if (alreadyDeployed) {
      return { kind: 'deployed', creationTimestamp: alreadyDeployed.localTimestamp }
    }
    const pending = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    if (seen && !pending) {
      throw expired()
    }

    // One inventory of already-stored content per upload; later batches rely on receipts.
    const receipts = new Map<string, FileReceipt>()
    if (!pending?.initialized) {
      const infos = await inventory(contentHashes)
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
        receipts.set(hash, { hash, size: info.contentSize, stored: true })
      }
    }
    let incomingBytes = 0
    for (const [hash, file] of uploadedFiles) {
      incomingBytes += file.size
      receipts.set(hash, { hash, size: file.size, stored: receipts.get(hash)?.stored ?? false })
    }
    const knownSceneBytes = Array.from(receipts.values())
      .filter((receipt) => receipt.hash !== entityId)
      .reduce((sum, receipt) => sum + BigInt(receipt.size), 0n)
    if (knownSceneBytes > maxSceneBytes) {
      throw new InvalidPartialDeploymentError(['Deployment failed: The deployment is too big.'])
    }

    const createdAt = await createUpload(entity, contentHashes, deployerAddress, seen ?? pending, requestedAt)
    try {
      await reserve(entityId, Array.from(receipts.values()), maxSceneBytes, incomingBytes)
    } catch (error) {
      // A first batch that isn't admitted must not keep its new upload holding a slot of the cap.
      if (!pending) await pendingDeploymentsRepository.deleteUnadmitted(database, entityId).catch(() => undefined)
      throw error
    }
    if (!pending) {
      metrics.increment('dcl_partial_uploads_started_total')
    }

    const expiresAt = createdAt + pendingDeploymentTtlMs
    await storeUntil(uploadedFiles, expiresAt)
    // A write that outlived the upload is left unrecorded; cleanup reclaims it with the upload's receipts.
    let batches = 0
    await database.transaction(async (tx) => {
      if (!(await pendingDeploymentsRepository.markInitializedIfLive(tx, entityId, pendingDeploymentTtlMs))) {
        throw expired()
      }
      await pendingDeploymentsRepository.markStored(tx, entityId, Array.from(uploadedFiles.keys()))
      batches = await pendingDeploymentsRepository.countBatch(tx, entityId)
    }, 'tx_record_pending_deployment_progress')

    const progress = await pendingDeploymentsRepository.getStoredFiles(database, entityId)
    const missing = contentHashes.filter((hash) => !progress.has(hash))
    metrics.increment('dcl_partial_upload_batches_total', { outcome: missing.length ? 'incomplete' : 'finalizing' })
    if (missing.length > 0) {
      return incompleteUntil(missing, expiresAt)
    }

    // One full verification at completion; the shared content lock keeps GC out until publication.
    const presentInfos = await inventory(contentHashes)
    const nowMissing = contentHashes.filter((hash) => presentInfos.get(hash) === undefined)
    if (nowMissing.length > 0) {
      await markMissing(entityId, nowMissing)
      return incompleteUntil(nowMissing, expiresAt)
    }

    return await finalize(entity, entityFile, authChain, contentHashes, createdAt, batches)
  }

  async function cleanupExpired(): Promise<number> {
    const { end } = metrics.startTimer('dcl_partial_upload_cleanup_duration_seconds')
    let outcome: 'success' | 'deferred' | 'error' = 'error'
    try {
      const { removed, deferred } = await reclaimExpired()
      outcome = deferred ? 'deferred' : 'success'
      if (!deferred) {
        metrics.observe('dcl_partial_upload_cleanup_last_success_timestamp_seconds', {}, Date.now() / 1000)
      }
      return removed
    } finally {
      end()
      metrics.increment('dcl_partial_upload_cleanup_runs_total', { outcome })
      lastCleanupAt = Date.now()
    }
  }

  async function reclaimExpired(): Promise<{ removed: number; deferred: boolean }> {
    const expired = await pendingDeploymentsRepository.listExpired(
      database,
      pendingDeploymentTtlMs,
      EXPIRED_UPLOADS_PER_CLEANUP
    )
    let removed = 0
    let deferred = false
    try {
      for (const entityId of expired) {
        // Accounting is released only after every physical delete batch succeeds.
        const keys = await pendingDeploymentsRepository.getStagedKeys(database, entityId)
        for (let offset = 0; offset < keys.length; offset += CLEANUP_DELETE_BATCH_SIZE) {
          const batch = keys.slice(offset, offset + CLEANUP_DELETE_BATCH_SIZE)
          await contentLocks.withWrite(async () => {
            const referenced = await contentFilesRepository.findReferencedHashes(
              database,
              batch,
              pendingDeploymentTtlMs
            )
            const orphaned = batch.filter((hash) => !referenced.has(hash))
            if (orphaned.length > 0) {
              await storage.delete(orphaned)
            }
          })
        }
        await pendingDeploymentsRepository.deleteExpiredByEntityId(database, entityId, pendingDeploymentTtlMs)
        removed++
      }
    } catch (error) {
      // Busy with deployments: the rest stays charged and is retried on the next run.
      if (!(error instanceof EntityLockTimeoutError)) {
        throw error
      }
      deferred = true
      logger.warn(`Expired-upload cleanup deferred after ${removed} upload(s): deployments kept the content lock busy`)
    }
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
    return { removed, deferred }
  }

  return { stageDeployment, cleanupExpired }
}
