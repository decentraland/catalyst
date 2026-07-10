import { streamToBuffer } from '@dcl/catalyst-storage/dist/content-item'
import { Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { EnvironmentConfig } from '../../Environment'
import { DeploymentContext, isInvalidDeployment } from '../../deployment-types'
import { AppComponents } from '../../types'
import { REQUEST_TTL_FORWARDS } from '../deployment-service/server-validator'
import { storeStreamsInBatches } from '../store-content'
import { InvalidPartialDeploymentError } from './errors'
import { IPartialDeployments, StageDeploymentInput, StageDeploymentResult } from './types'

// Bounded retry for the rare case where two requests complete a partial upload at the same instant:
// the loser of the in-memory pointer lock retries and hits deployEntity's idempotency fast path.
const FINALIZE_POINTER_CONFLICT_RETRIES = 3
const FINALIZE_POINTER_CONFLICT_DELAY_MS = 300

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
  >
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
    pendingDeploymentsRepository
  } = components
  const logger = logs.getLogger('partial-deployments')
  const pendingDeploymentTtlMs = env.getConfig<number>(EnvironmentConfig.PENDING_DEPLOYMENT_TTL)
  const requestTtlBackwards = env.getConfig<number>(EnvironmentConfig.REQUEST_TTL_BACKWARDS)
  const maxPendingPerDeployer = env.getConfig<number>(EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER)

  async function finalize(entityId: string, entityFile: Uint8Array, authChain: StageDeploymentInput['authChain']) {
    // The deploy pipeline re-reads content from storage (all of it is present now), so only the entity
    // file needs to be in the map. Passing a Map hits deployEntity's hashFiles fast path (no re-hash).
    const finalizeFiles = new Map<string, Uint8Array>([[entityId, entityFile]])
    for (let attempt = 0; ; attempt++) {
      const result = await deployer.deployEntity(finalizeFiles, entityId, { authChain }, DeploymentContext.LOCAL)
      if (!isInvalidDeployment(result)) {
        // number === creation timestamp; the pending row was deleted inside the deploy transaction.
        return result
      }
      const isPointerConflict = result.kind === 'pointer-conflict'
      if (isPointerConflict && attempt < FINALIZE_POINTER_CONFLICT_RETRIES) {
        await sleep(FINALIZE_POINTER_CONFLICT_DELAY_MS)
        continue
      }
      // Exhausting the pointer-conflict retries is a transient condition (someone else is deploying on
      // these pointers right now), not a validation failure: 429 tells the client to resume later —
      // the staged content is intact.
      throw new InvalidPartialDeploymentError(result.errors, isPointerConflict ? 429 : 400)
    }
  }

  async function storeUploaded(uploadedFiles: Map<string, Uint8Array>): Promise<void> {
    // Store every file the client sent this batch, in bounded-parallel batches (shared helper). We do
    // NOT skip files a pre-request snapshot said were already stored: that snapshot is taken before the
    // pending row (and its GC protection) is committed, so a file present then could be swept before we
    // get here — and skipping it would discard bytes the client uploaded in this very batch. Storage is
    // content-addressed so re-storing an already-present file is an idempotent no-op, and the client
    // already omits files reported by /available-content, so this rarely re-sends present content.
    await storeStreamsInBatches(storage, Array.from(uploadedFiles))
  }

  async function stageDeployment({ entityId, authChain, files }: StageDeploymentInput): Promise<StageDeploymentResult> {
    // Entity deployments are idempotent: if it's already deployed, report it as such (this also covers
    // a staging request that arrives after a concurrent finalize won).
    const alreadyDeployed = await deploymentsRepository.getEntityById(database, entityId)
    if (alreadyDeployed) {
      return { kind: 'deployed', creationTimestamp: alreadyDeployed.localTimestamp }
    }

    // Partial deployments are v3/IPFSv2 only (the legacy Qm hash path is not supported).
    if (!IPFSv2.validate(entityId)) {
      throw new InvalidPartialDeploymentError([
        `The entity id '${entityId}' is not a valid IPFS v2 hash. Partial deployments require IPFS v2 entities.`
      ])
    }

    // Verify every uploaded file hashes to its multipart field-name key. In partial mode the keys are
    // load-bearing (unlike a full deploy, where files are re-keyed by their computed hash).
    const entries = Array.from(files.entries())
    const hashed = await crypto.calculateIPFSHashes(entries.map(([, buf]) => buf))
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

    // The entity JSON must be present in the first request; later (resume) requests re-read it from
    // storage, where it was stored under its own id on the first request.
    let entityFile = uploadedFiles.get(entityId)
    if (!entityFile) {
      const stored = await storage.retrieve(entityId)
      if (!stored) {
        throw new InvalidPartialDeploymentError([
          `The first partial request for an entity must include the entity file '${entityId}'.`
        ])
      }
      entityFile = await streamToBuffer(await stored.asStream())
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

    // Existing pending row (drives TTL anchoring; a row past its TTL is treated as absent).
    const pending = await pendingDeploymentsRepository.getByEntityId(database, entityId)
    const activePending =
      pending && Date.now() - pending.createdAt.getTime() <= pendingDeploymentTtlMs ? pending : undefined

    // Content-independent validations: entity structure, IPFS hashing, metadata schema, ADR45,
    // signature, scene rules, "reject extra files", and the LAND access/ownership check.
    //
    // Resume batches skip the slow on-chain/subgraph access check, but only when the signer is the
    // deployer who created the pending record: that creation required passing the access check, every
    // uploaded byte is hash-verified against the staged manifest, and finalize re-runs the full
    // validation (including access) before going live. Any other signer — authorized or not — goes
    // through the full staging validation, so a third party can't ride an existing upload's fast path.
    const isResumeBySameDeployer =
      !!activePending &&
      activePending.deployerAddress.toLowerCase() === Authenticator.ownerAddress(authChain).toLowerCase()
    const validationResult = await validator.validateStagingScene(
      {
        entity,
        files: uploadedFiles,
        auditInfo: { authChain }
      },
      { skipAccessCheck: isResumeBySameDeployer }
    )
    if (!validationResult.ok) {
      throw new InvalidPartialDeploymentError(validationResult.errors ?? ['The staging validation was not successful.'])
    }

    // Server-side checks that mirror the LOCAL-context localChecks, minus content completeness.
    if (await deploymentsRepository.hasNewerDeploymentOnPointers(database, entity)) {
      throw new InvalidPartialDeploymentError([
        `There is a newer entity pointed by one or more of the pointers you provided (entityId=${entity.id}).`
      ])
    }
    if (deployer.isRateLimited(entity.type, entity.pointers)) {
      // 429: rate limiting is transient, so a client can resume once the window clears (the staged
      // content is preserved server-side), rather than treating it as a terminal validation failure.
      throw new InvalidPartialDeploymentError(
        [`Entity rate limited (entityId=${entity.id} pointers=${entity.pointers.join(',')}).`],
        429
      )
    }
    // Cap concurrent staged uploads per deployer so one account can't pin storage across many
    // pointer-sets for the full TTL. Only NEW uploads count against the cap — a resume (activePending)
    // reuses its existing slot.
    if (!activePending) {
      const activeCount = await pendingDeploymentsRepository.countActiveByDeployer(
        database,
        Authenticator.ownerAddress(authChain),
        pendingDeploymentTtlMs
      )
      if (activeCount >= maxPendingPerDeployer) {
        throw new InvalidPartialDeploymentError([
          `Too many partial uploads in progress for this account (max ${maxPendingPerDeployer}). Finalize or abandon an existing upload before starting another.`
        ])
      }
    }
    // A partial upload can span longer than REQUEST_TTL_BACKWARDS, so anchor the freshness check on
    // when the upload started (the pending row's created_at) rather than now.
    const ttlAnchor = activePending ? activePending.createdAt.getTime() : Date.now()
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

    // Cumulative size budget. Mirrors calculateDeploymentSize (the finalize-time check): sum uploaded
    // bytes for files in this batch and stored sizes for files staged earlier. Checked before storing
    // this batch so an over-budget upload is never persisted.
    const contentHashes = Array.from(new Set((entity.content ?? []).map((c) => c.hash)))
    const storedInfo = await storage.fileInfoMultiple(contentHashes)
    let totalSize = 0
    for (const hash of contentHashes) {
      const uploaded = uploadedFiles.get(hash)
      if (uploaded) {
        totalSize += uploaded.byteLength
        continue
      }
      const info = storedInfo.get(hash)
      if (info === undefined) {
        // Not uploaded in this batch and not yet stored — it will arrive in a later request.
        continue
      }
      if (info.contentSize == null) {
        // Stored, but its size can't be determined. The finalize-time size validation fetches the same
        // contentSize and fails with "Couldn't fetch content file"; fail fast now (on the first request
        // that references it) instead of after the whole scene has been uploaded.
        throw new InvalidPartialDeploymentError([
          `Couldn't determine the size of the already-stored content file: ${hash}`
        ])
      }
      totalSize += info.contentSize
    }
    const maxSizePerPointer = validator.getMaxSizeInBytesPerPointer(EntityType.SCENE)
    if (totalSize / entity.pointers.length > maxSizePerPointer) {
      // Drop the pending row (and let its content become GC-eligible) so an over-budget upload can't
      // hold staged storage until expiry.
      await pendingDeploymentsRepository.deleteByEntityId(database, entityId)
      throw new InvalidPartialDeploymentError([
        `The deployment is too big. The maximum allowed size per pointer is ${
          maxSizePerPointer / (1024 * 1024)
        } MB for ${entity.type}. You can upload up to ${
          entity.pointers.length * maxSizePerPointer
        } bytes but you tried to upload ${totalSize}.`
      ])
    }

    // Record/refresh the pending deployment, replacing any pending upload on overlapping pointers, in a
    // short transaction serialized by an advisory lock. This runs on EVERY batch (not only the first)
    // and always BEFORE storing the batch's files: it is what protects the staged content from the
    // garbage collector, and re-asserting it per batch resurrects the row if a competing overlapping
    // upload replaced it between requests — otherwise this batch's files would be written with no GC
    // protection for the remainder of the upload. The upsert resets an expired row's created_at (see
    // the repository), so a resurrected row never carries a stale TTL anchor; purging other entities'
    // expired rows is the cleanup job's responsibility, not this per-request critical section's.
    await database.transaction(async (tx) => {
      await pendingDeploymentsRepository.acquireStagingLock(tx)

      // The single pending slot per pointer set goes to the NEWEST scene (deployment ordering: greater
      // entity.timestamp, tie broken by greater entity id). Reject rather than replace when a
      // strictly-newer overlapping upload is already in flight, so a stale/older upload can't evict a
      // newer competitor's staged content (and two clients can't ping-pong evicting each other). A
      // resume (same entity id) is excluded from the overlap set and never conflicts with itself.
      const overlapping = await pendingDeploymentsRepository.getOverlappingPointers(tx, entity.pointers, entityId)
      const newer = overlapping.find(
        (o) => o.entityTimestamp > entity.timestamp || (o.entityTimestamp === entity.timestamp && o.entityId > entityId)
      )
      if (newer) {
        throw new InvalidPartialDeploymentError([
          `A newer partial upload (${newer.entityId}) is already in progress for one or more of these pointers.`
        ])
      }

      // Having rejected the newer-conflict above, every overlapping row is strictly older — replace them.
      const replaced = await pendingDeploymentsRepository.deleteOverlappingPointers(tx, entity.pointers, entityId)
      if (replaced.length > 0) {
        metrics.increment('dcl_pending_deployments_replaced_total', {}, replaced.length)
        logger.info(`Replaced ${replaced.length} pending deployment(s) overlapping the new one's pointers`, {
          entityId,
          replaced: replaced.join(',')
        })
      }
      // The upsert resets an expired row's created_at itself (fresh TTL window), so no global expired
      // sweep is needed here — that is the cleanup job's duty, not this per-request critical section's.
      await pendingDeploymentsRepository.upsert(
        tx,
        {
          entityId,
          entityType: entity.type,
          pointers: entity.pointers,
          contentHashes,
          deployerAddress: Authenticator.ownerAddress(authChain),
          entityTimestamp: entity.timestamp
        },
        pendingDeploymentTtlMs
      )
    }, 'tx_stage_pending_deployment')

    // Store the batch's files (content-addressed, so concurrent identical writes are idempotent).
    await storeUploaded(uploadedFiles)

    // Completeness must be a fresh read (not derived from storedInfo): a concurrent partial request for
    // the same entity may have stored the remaining content while this one ran, and whichever request
    // observes the full set is the one that finalizes.
    const present = await storage.existMultiple(contentHashes)
    const missing = contentHashes.filter((hash) => !present.get(hash))
    if (missing.length > 0) {
      return { kind: 'incomplete', missing }
    }

    const creationTimestamp = await finalize(entityId, entityFile, authChain)
    return { kind: 'deployed', creationTimestamp }
  }

  async function cleanupExpired(): Promise<number> {
    const removed = await pendingDeploymentsRepository.deleteExpired(database, pendingDeploymentTtlMs)
    if (removed > 0) {
      metrics.increment('dcl_pending_deployments_expired_total', {}, removed)
      logger.info(`Removed ${removed} expired pending deployment(s)`)
    }
    return removed
  }

  return { stageDeployment, cleanupExpired }
}
