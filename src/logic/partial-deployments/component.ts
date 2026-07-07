import { bufferToStream, streamToBuffer } from '@dcl/catalyst-storage/dist/content-item'
import { Authenticator } from '@dcl/crypto'
import { Entity, EntityType, IPFSv2 } from '@dcl/schemas'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { EnvironmentConfig } from '../../Environment'
import { DeploymentContext, isInvalidDeployment } from '../../deployment-types'
import { AppComponents } from '../../types'
import { POINTERS_BEING_DEPLOYED_ERROR } from '../deployment-service'
import { REQUEST_TTL_FORWARDS } from '../deployment-service/server-validator'
import { InvalidPartialDeploymentError } from './errors'
import { IPartialDeployments, StageDeploymentInput, StageDeploymentResult } from './types'

// Upper bound on concurrent content-file writes for a staging batch — matches the vanilla deploy path's
// CONTENT_STORE_CONCURRENCY. Content files are content-addressed and independent, so they store in
// bounded-parallel batches instead of one awaited write at a time.
const CONTENT_STORE_CONCURRENCY = 10

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
      const isPointerConflict = result.errors.some((e) => e.includes(POINTERS_BEING_DEPLOYED_ERROR))
      if (isPointerConflict && attempt < FINALIZE_POINTER_CONFLICT_RETRIES) {
        await sleep(FINALIZE_POINTER_CONFLICT_DELAY_MS)
        continue
      }
      throw new InvalidPartialDeploymentError(result.errors)
    }
  }

  async function storeMissing(uploadedFiles: Map<string, Uint8Array>): Promise<void> {
    const alreadyStored = await storage.existMultiple(Array.from(uploadedFiles.keys()))
    const toStore = Array.from(uploadedFiles).filter(([hash]) => !alreadyStored.get(hash))
    for (let i = 0; i < toStore.length; i += CONTENT_STORE_CONCURRENCY) {
      await Promise.all(
        toStore
          .slice(i, i + CONTENT_STORE_CONCURRENCY)
          .map(([hash, content]) => storage.storeStream(hash, bufferToStream(content)))
      )
    }
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
    const validationResult = await validator.validateStagingScene({
      entity,
      files: uploadedFiles,
      auditInfo: { authChain }
    })
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
      throw new InvalidPartialDeploymentError([
        `Entity rate limited (entityId=${entity.id} pointers=${entity.pointers.join(',')}).`
      ])
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
    // short transaction serialized by an advisory lock. Done BEFORE storing the batch so the staged
    // content is protected from the garbage collector as soon as it lands.
    await database.transaction(async (tx) => {
      await pendingDeploymentsRepository.acquireStagingLock(tx)
      const replaced = await pendingDeploymentsRepository.deleteOverlappingPointers(tx, entity.pointers, entityId)
      if (replaced.length > 0) {
        metrics.increment('dcl_pending_deployments_replaced_total', {}, replaced.length)
        logger.info(`Replaced ${replaced.length} pending deployment(s) overlapping the new one's pointers`, {
          entityId,
          replaced: replaced.join(',')
        })
      }
      await pendingDeploymentsRepository.upsert(tx, {
        entityId,
        entityType: entity.type,
        pointers: entity.pointers,
        contentHashes,
        deployerAddress: Authenticator.ownerAddress(authChain)
      })
    }, 'tx_stage_pending_deployment')

    // Store the batch's files (content-addressed, so concurrent identical writes are idempotent), in
    // bounded-parallel batches, skipping anything already stored.
    await storeMissing(uploadedFiles)

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
