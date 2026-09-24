import { Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { hashV1 } from '@dcl/hashing'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { FileReceipt, PendingDeploymentRow } from '../../adapters/pending-deployments-repository'
import { EnvironmentConfig } from '../../Environment'
import { DeploymentContext, isInvalidDeployment } from '../../deployment-types'
import { AppComponents } from '../../types'
import { REQUEST_TTL_FORWARDS } from '../deployment-service/server-validator'
import { CONTENT_STORE_CONCURRENCY, storeStreamsInBatches } from '../store-content'
import { InvalidPartialDeploymentError } from './errors'
import { IPartialDeployments, StagedFile, StageDeploymentInput, StageDeploymentResult } from './types'

// Bounded retry for two requests completing the same upload at once: the loser of the in-memory
// pointer lock retries and hits deployEntity's idempotency fast path.
const FINALIZE_POINTER_CONFLICT_RETRIES = 3
const FINALIZE_POINTER_CONFLICT_DELAY_MS = 300

// Caps the manifest on both paths: a resume reads it back from storage outside the multipart budget.
const MAX_ENTITY_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const EMPTY_FILE = new Uint8Array(0)

// Expired uploads reclaimed per cleanup run, and storage keys per exclusive delete batch.
const EXPIRED_UPLOADS_PER_CLEANUP = 100
const CLEANUP_DELETE_BATCH_SIZE = 1000

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
 * Stages authenticated, entity-keyed partial upload batches. The HTTP handler holds the shared content
 * lock and the per-entity lock through this operation, including publication. Overlapping uploads
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
    | 'storage'
    | 'database'
    | 'validator'
    | 'deployer'
    | 'entities'
    | 'deploymentsRepository'
    | 'pendingDeploymentsRepository'
    | 'contentFilesRepository'
    | 'contentLocks'
  >
): IPartialDeployments {
  const {
    logs,
    metrics,
    env,
    storage,
    database,
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
  const accountBytes = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER))
  const globalBytes = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PENDING_BYTES))
  const bytesPerMinute = BigInt(env.getConfig<number>(EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE))

  function isLive(row: PendingDeploymentRow): boolean {
    return Date.now() - row.createdAt.getTime() <= pendingDeploymentTtlMs
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
    contentHashes: string[]
  ): Promise<StageDeploymentResult> {
    const entityId = entity.id
    // The deploy pipeline re-reads content from storage, so only the entity file needs to be in the map.
    const finalizeFiles = new Map<string, Uint8Array>([[entityId, entityFile]])
    for (let attempt = 0; ; attempt++) {
      const result = await deployer.deployEntity(finalizeFiles, entityId, { authChain }, DeploymentContext.LOCAL)
      if (!isInvalidDeployment(result)) {
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
        return { kind: 'incomplete', missing: missingNow }
      }

      // Catalyst-only transient conditions keep their retryable 429.
      if (deployer.isRateLimited(entity.type, entity.pointers)) {
        throw new InvalidPartialDeploymentError(result.errors, 429, deployer.getRateLimitTtlSeconds(entity.type))
      }
      throw new InvalidPartialDeploymentError(result.errors, isPointerConflict ? 429 : 400)
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
    const signature = await Authenticator.validateSignature(entityId, authChain, null, Date.now())
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
    return streamToBufferCapped(await stored.asStream(), MAX_ENTITY_FILE_SIZE_BYTES)
  }

  async function createUpload(entity: Entity, contentHashes: string[], deployerAddress: string): Promise<void> {
    await database.transaction(async (tx) => {
      await pendingDeploymentsRepository.acquireDeployerLock(tx, deployerAddress)
      const existing = await pendingDeploymentsRepository.getByEntityId(tx, entity.id)
      if (existing) {
        if (!isLive(existing)) {
          throw new InvalidPartialDeploymentError(['This upload expired. Create a new entity with a fresh timestamp.'])
        }
        return
      }
      if ((await pendingDeploymentsRepository.countByDeployer(tx, deployerAddress)) >= maxPendingPerDeployer) {
        throw new InvalidPartialDeploymentError([
          `Too many partial uploads in progress for this account (max ${maxPendingPerDeployer}). Complete an upload or wait for expired uploads to be cleaned up.`
        ])
      }
      await pendingDeploymentsRepository.insert(tx, {
        entityId: entity.id,
        entityType: entity.type,
        pointers: entity.pointers,
        contentHashes,
        deployerAddress
      })
    }, 'tx_create_pending_deployment')
  }

  async function reserve(
    entityId: string,
    receipts: FileReceipt[],
    maxSceneBytes: bigint,
    incomingBytes: number
  ): Promise<void> {
    await database.transaction(async (tx) => {
      // One short global critical section makes both aggregate budgets atomic; no storage I/O under it.
      await pendingDeploymentsRepository.acquireBudgetLock(tx)
      const upload = await pendingDeploymentsRepository.getByEntityId(tx, entityId)
      if (!upload) {
        throw new InvalidPartialDeploymentError(['Upload no longer exists; resend its manifest.'])
      }
      await pendingDeploymentsRepository.upsertFileReceipts(tx, entityId, receipts)
      await pendingDeploymentsRepository.refreshReservedBytes(tx, entityId)
      const totals = await pendingDeploymentsRepository.getReservationTotals(tx, entityId, upload.deployerAddress)
      if (totals.scene > maxSceneBytes) {
        throw new InvalidPartialDeploymentError(['Deployment failed: The deployment is too big.'])
      }
      if (totals.account > accountBytes || totals.total > globalBytes) {
        throw new InvalidPartialDeploymentError([
          'Partial upload storage budget exceeded. Complete uploads or wait for cleanup.'
        ])
      }
      const windowBytes = await pendingDeploymentsRepository.addIncomingBytes(tx, upload.deployerAddress, incomingBytes)
      if (windowBytes > bytesPerMinute) {
        throw new InvalidPartialDeploymentError(['Partial upload byte rate exceeded. Retry after one minute.'])
      }
      metrics.observe('dcl_partial_upload_reserved_bytes', {}, Number(totals.total))
    }, 'tx_reserve_pending_deployment')
  }

  async function stageDeployment({ entityId, authChain, files }: StageDeploymentInput): Promise<StageDeploymentResult> {
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
      entityFile = await uploadedEntityFile.read()
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
      throw new InvalidPartialDeploymentError(['This upload expired. Create a new entity with a fresh timestamp.'])
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
        deployer.getRateLimitTtlSeconds(entity.type)
      )
    }
    // Freshness is measured once, at admission.
    const ttlAnchor = pending ? pending.createdAt.getTime() : Date.now()
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

    await createUpload(entity, contentHashes, deployerAddress)
    await reserve(entityId, Array.from(receipts.values()), maxSceneBytes, incomingBytes)

    await storeStreamsInBatches(
      storage,
      Array.from(uploadedFiles, ([hash, file]) => [hash, () => file.openStream()])
    )
    await database.transaction(async (tx) => {
      await pendingDeploymentsRepository.markStored(tx, entityId, Array.from(uploadedFiles.keys()))
      await pendingDeploymentsRepository.markInitialized(tx, entityId)
    }, 'tx_record_pending_deployment_progress')

    const progress = await pendingDeploymentsRepository.getStoredFiles(database, entityId)
    const missing = contentHashes.filter((hash) => !progress.has(hash))
    metrics.increment('dcl_partial_upload_batches_total', { outcome: missing.length ? 'incomplete' : 'finalizing' })
    if (missing.length > 0) {
      return { kind: 'incomplete', missing }
    }

    // One full verification at completion; the shared content lock keeps GC out until publication.
    const presentInfos = await inventory(contentHashes)
    const nowMissing = contentHashes.filter((hash) => presentInfos.get(hash) === undefined)
    if (nowMissing.length > 0) {
      await markMissing(entityId, nowMissing)
      return { kind: 'incomplete', missing: nowMissing }
    }

    return await finalize(entity, entityFile, authChain, contentHashes)
  }

  async function cleanupExpired(): Promise<number> {
    const expired = await pendingDeploymentsRepository.listExpired(
      database,
      pendingDeploymentTtlMs,
      EXPIRED_UPLOADS_PER_CLEANUP
    )
    let removed = 0
    for (const entityId of expired) {
      // Accounting is released only after every physical delete batch succeeds.
      const keys = await pendingDeploymentsRepository.getStagedKeys(database, entityId)
      for (let offset = 0; offset < keys.length; offset += CLEANUP_DELETE_BATCH_SIZE) {
        const batch = keys.slice(offset, offset + CLEANUP_DELETE_BATCH_SIZE)
        await contentLocks.withWrite(async () => {
          const referenced = await contentFilesRepository.findReferencedHashes(database, batch, pendingDeploymentTtlMs)
          const orphaned = batch.filter((hash) => !referenced.has(hash))
          if (orphaned.length > 0) {
            await storage.delete(orphaned)
          }
        })
      }
      await pendingDeploymentsRepository.deleteExpiredByEntityId(database, entityId, pendingDeploymentTtlMs)
      removed++
    }
    await pendingDeploymentsRepository.deleteElapsedRateWindows(database)
    const reserved = await pendingDeploymentsRepository.getReservedBytes(database, pendingDeploymentTtlMs)
    metrics.observe('dcl_partial_upload_reserved_bytes', {}, reserved.total)
    metrics.observe('dcl_partial_upload_cleanup_backlog_bytes', {}, reserved.expired)
    if (removed > 0) {
      metrics.increment('dcl_pending_deployments_expired_total', {}, removed)
      logger.info(`Reclaimed ${removed} expired pending deployment(s)`)
    }
    return removed
  }

  return { stageDeployment, cleanupExpired }
}
