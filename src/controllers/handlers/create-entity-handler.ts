import { PostEntity200, PostEntity400 } from '@dcl/catalyst-api-specs/lib/client'
import { Field } from '@well-known-components/multipart-wrapper'
import { AuthChain, AuthLink, Authenticator, EthAddress } from '@dcl/crypto'
import { DeploymentContext, InvalidResult, isInvalidDeployment, isSuccessfulDeployment } from '../../deployment-types'
import { createReadStream } from 'fs'
import { readFile } from 'fs/promises'
import { bufferToStream } from '@dcl/catalyst-storage'
import { EntityLockTimeoutError } from '../../adapters/content-locks'
import { UploadBudgetExceededError, UploadBudgetLease } from '../../adapters/upload-budget'
import {
  InvalidPartialDeploymentError,
  MAX_ENTITY_FILE_SIZE_BYTES,
  PartialDeploymentUnavailableError,
  StagedFile
} from '../../logic/partial-deployments'
import { DeploymentFileSource, ReadDeployment } from '../../logic/deployment-service/types'
import { FormHandlerContextWithPath, SpooledFile } from '../../types'
import { InvalidRequestError, ServiceUnavailableError } from '../errors'
import { RequestArrivalContext } from '../request-arrival'
import { SPOOL_UNAVAILABLE_MESSAGE, UPLOAD_UNAVAILABLE_RETRY_AFTER_SECONDS } from '../multipart'
import { PartialQuotaContext } from '../deployment-quota'

/** Body of a 202 response to a partial deployment request: the content hashes not yet on the server. */
type PostEntity202 = { missing: string[] }

// A real auth chain has 2-3 links; cap generously. This bounds the index-parsing loop below so a
// crafted `authChain[<huge>][...]` field name can't drive a large iteration count on the public,
// unauthenticated POST /entities endpoint (issue #1936).
const MAX_AUTH_CHAIN_LENGTH = 10

// Spool read failures that may clear on retry; anything else (ENOENT included) is a bug and stays a 500.
const TRANSIENT_SPOOL_READ_ERROR_CODES = new Set([
  'EIO',
  'EMFILE',
  'ENFILE',
  'ENOSPC',
  'EAGAIN',
  'EBUSY',
  'EDQUOT',
  'ENOMEM',
  'ETIMEDOUT',
  'ESTALE'
])

type Response =
  | { status: 200; body: PostEntity200 }
  | { status: 202; body: PostEntity202 }
  | { status: 400 | 429 | 503; body: PostEntity400; headers?: Record<string, string> }

// Method: POST
export async function createEntity(
  context: FormHandlerContextWithPath<
    | 'logs'
    | 'fs'
    | 'metrics'
    | 'deployer'
    | 'partialDeployments'
    | 'contentLocks'
    | 'deploymentMemoryBudget'
    | 'crypto',
    '/entities'
  > &
    RequestArrivalContext &
    PartialQuotaContext
): Promise<Response> {
  const { metrics, deployer, partialDeployments, logs, contentLocks, deploymentMemoryBudget, crypto } =
    context.components

  const logger = logs.getLogger('create-entity')
  // Guard the required field explicitly: without it a missing `entityId` throws a TypeError and the
  // request fails with a 500 (and an error log) instead of a 400 — trivially abusable on this public
  // endpoint to generate log noise.
  const entityIdField = context.formData.fields.entityId
  if (!entityIdField) {
    throw new InvalidRequestError('Missing required field: entityId')
  }
  const entityId: string = entityIdField.value
  const userAgent: string = context.request.headers.get('user-agent') ?? 'unknown'

  const authChain = extractAuthChain(context.formData.fields)
  // Null-safe: a client-supplied `authChain` JSON can parse to an array whose first element is
  // missing or not an object (e.g. `[]`, `[null]`). Reading `.payload` directly would throw a
  // TypeError here — before the try/catch below — and surface as a 500. The structural check is
  // left to AuthChain.validate(), which returns a clean 400. Used only for logging.
  const ethAddress: EthAddress = authChain?.[0]?.payload ?? ''

  // `authChain` is required. The previous "simple auth chain" fallback was dead code: it derived the
  // address from the very authChain whose absence was its precondition, so it could never run.
  if (!authChain) {
    throw new InvalidRequestError('No auth chain can be derivated')
  }
  if (!AuthChain.validate(authChain)) {
    throw new InvalidRequestError('Invalid auth chain')
  }

  const isPartial = context.formData.fields.partial?.value === 'true'

  // Deployments are idempotent: a replay of a published entity gets its original timestamp without
  // re-authentication (its chain may have expired since), as deployEntity has always answered.
  const deployedTimestamp = await deployer.getDeployedEntityTimestamp(entityId)
  if (deployedTimestamp !== undefined) {
    if (isPartial) {
      metrics.increment('dcl_partial_deployments_staging_total', { kind: 'replayed' })
    } else {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'success' })
    }
    logger.info(`POST /entities - Entity already deployed`, { entityId, ethAddress, userAgent })
    return { status: 200, body: { creationTimestamp: deployedTimestamp } }
  }

  // A source that spent its daily quota may only resume the signer's own upload, which skips the access check.
  const quotaRetryAfter = context.partialQuota?.exhaustedRetryAfterSeconds
  if (
    isPartial &&
    quotaRetryAfter !== undefined &&
    !(await partialDeployments.isLiveUploadOf(entityId, Authenticator.ownerAddress(authChain)))
  ) {
    metrics.increment('dcl_partial_deployments_staging_total', { kind: 'throttled' })
    return {
      status: 429,
      body: {
        errors: ['The daily deployment quota for this client is exhausted. Only uploads in progress can continue.']
      },
      headers: { 'Retry-After': String(quotaRetryAfter) }
    }
  }

  // Authenticate before taking any lock, so a request that can't be authenticated never holds a lock
  // connection. Same check, expiry date (the entity's timestamp) and message as the deployment validator.
  if (isPartial) {
    return handlePartialBatch(authChain)
  }
  const uploaded = Object.values(context.formData.files)
  const deployment = await readDeployment(uploaded)
  if (isInvalidDeployment(deployment)) {
    metrics.increment('dcl_deployments_endpoint_counter', { kind: 'validation_error' })
    logger.error(`POST /entities - Deployment failed (${deployment.errors.join(',')})`, {
      entityId,
      ethAddress,
      userAgent
    })
    return { status: 400, body: { errors: deployment.errors } }
  }
  const signatureError = await checkSignature(authChain, deployment.entity.timestamp)
  if (signatureError) {
    return signatureError
  }
  // Every deployment holds the shared content lock through publication, so garbage collection can't
  // delete content it stores or reuses. The memory share is taken and the files read in before it, so a
  // full budget sheds the deployment without a lock-pool connection and the lock never waits on the disk.
  const memoryLease = acquireMemory(uploaded.reduce((sum, file) => sum + file.size, 0))
  try {
    const deployFiles = await readDeployFiles(deployment)
    return await withContentLock(() => deployRegular(deployFiles, authChain), entityId)
  } finally {
    memoryLease.release()
  }

  async function checkSignature(authChain: AuthChain, signatureDate: number): Promise<Response | undefined> {
    const signature = await crypto.validateSignature(entityId, authChain, signatureDate)
    if (signature.ok) {
      return undefined
    }
    if (isPartial) {
      metrics.increment('dcl_partial_deployments_staging_total', { kind: 'validation_error' })
    } else {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'validation_error' })
    }
    return { status: 400, body: { errors: [`The signature is invalid. ${signature.message}`] } }
  }

  // The entity file is read from disk once, under a memory share held until staging settles; it is hashed
  // here and in staging from memory, and staging stores those bytes.
  async function handlePartialBatch(authChain: AuthChain): Promise<Response> {
    // Only an entity file within staging's size cap is read, as staging itself requires.
    const uploadedEntity = context.formData.files[entityId]
    const readsEntity = !!uploadedEntity && uploadedEntity.size <= MAX_ENTITY_FILE_SIZE_BYTES
    const memoryLease = readsEntity ? acquireMemory(uploadedEntity.size) : undefined
    try {
      const entityBytes = readsEntity ? await readPartialEntityFile(uploadedEntity.path) : undefined
      // Handed to staging only once it hashes to the entity id; a batch whose file doesn't fails staging's hash check.
      let entityFile: Uint8Array | undefined
      const read = entityBytes
        ? await deployer.readDeployment(
            [{ openStream: () => bufferToStream(entityBytes), read: async () => (entityFile = entityBytes) }],
            entityId
          )
        : undefined
      // A batch without a readable entity file is a resume, whose storage read-back needs a chain valid now.
      const signatureDate = read && !isInvalidDeployment(read) ? read.entity.timestamp : Date.now()
      const signatureError = await checkSignature(authChain, signatureDate)
      // Staging takes the content lock itself, only for storage and publication.
      return signatureError ?? (await stagePartialBatch(authChain, entityFile))
    } finally {
      memoryLease?.release()
    }
  }

  // A `partial=true` field marks a staging request of a multi-request (partial) deployment: the content
  // may be uploaded across several requests and the entity only becomes live once all of it is present.
  async function stagePartialBatch(authChain: AuthChain, entityFile: Uint8Array | undefined): Promise<Response> {
    // Preserve the field-name keys (content hashes): unlike the vanilla path, they are load-bearing.
    // The files stay on disk; staging streams them.
    const files = new Map<string, StagedFile>()
    for (const filename of Object.keys(context.formData.files)) {
      const file = context.formData.files[filename]
      files.set(filename, filename === entityId && entityFile ? inMemoryStagedFile(entityFile) : toStagedFile(file))
    }

    try {
      const result = await partialDeployments.stageDeployment({
        entityId,
        authChain,
        files,
        entityFile,
        requestedAt: context.requestArrivedAt,
        onAdmitted: ({ created }) => {
          if (!context.partialQuota) return
          context.partialQuota.admitted = true
          context.partialQuota.created = created
        }
      })
      if (result.kind === 'deployed' || result.kind === 'replayed') {
        const finalized = result.kind === 'deployed'
        metrics.increment('dcl_partial_deployments_staging_total', { kind: finalized ? 'finalized' : 'replayed' })
        logger.info(`POST /entities - Partial deployment ${finalized ? 'finalized' : 'already deployed'}`, {
          entityId,
          ethAddress,
          userAgent
        })
        return { status: 200, body: { creationTimestamp: result.creationTimestamp } }
      }
      metrics.increment('dcl_partial_deployments_staging_total', { kind: 'accepted' })
      logger.info(`POST /entities - Partial deployment staged`, {
        entityId,
        ethAddress,
        userAgent,
        missing: result.missing.length
      })
      return { status: 202, body: { missing: result.missing } }
    } catch (error) {
      if (error instanceof InvalidPartialDeploymentError) {
        const throttled = error.statusCode === 429
        metrics.increment('dcl_partial_deployments_staging_total', {
          kind: throttled ? 'throttled' : 'validation_error'
        })
        if (throttled) {
          metrics.increment('dcl_partial_upload_throttled_total', { reason: error.throttleReason ?? 'unknown' })
        }
        const logged = { entityId, ethAddress, userAgent }
        if (throttled) {
          // Throttling is ordinary client back-off, not a server failure.
          logger.warn(`POST /entities - Partial deployment throttled (${error.errors.join(',')})`, logged)
        } else {
          logger.error(`POST /entities - Partial deployment failed (${error.errors.join(',')})`, logged)
        }
        // statusCode is 429 for transient conditions (rate limiting), 400 for validation errors. On a
        // 429 with a known window, send Retry-After so the client waits it out instead of exhausting its
        // resume budget inside the window.
        const headers =
          error.statusCode === 429 && error.retryAfterSeconds !== undefined
            ? { 'Retry-After': String(error.retryAfterSeconds) }
            : undefined
        return { status: error.statusCode, body: { errors: error.errors }, headers }
      }
      if (error instanceof PartialDeploymentUnavailableError) {
        metrics.increment('dcl_partial_deployments_staging_total', { kind: 'error' })
        logger.error(`POST /entities - Partial deployment could not be published (${error.errors.join(',')})`, {
          entityId,
          ethAddress,
          userAgent
        })
        return {
          status: 503,
          body: { errors: error.errors },
          headers: { 'Retry-After': String(error.retryAfterSeconds) }
        }
      }
      if (error instanceof EntityLockTimeoutError || error instanceof UploadBudgetExceededError) {
        metrics.increment('dcl_partial_deployments_staging_total', { kind: 'busy' })
        throw error instanceof UploadBudgetExceededError
          ? new ServiceUnavailableError(error.message, UPLOAD_UNAVAILABLE_RETRY_AFTER_SECONDS)
          : new ServiceUnavailableError(error.message)
      }
      metrics.increment('dcl_partial_deployments_staging_total', { kind: 'error' })
      // Never log `authChain` or `signature`: they are cryptographic credentials.
      logger.error(`POST /entities - Partial deployment internal server error '${error}'`, {
        entityId,
        ethAddress,
        userAgent
      })
      logger.error(error)
      throw error
    }
  }

  // The regular deploy pipeline validates from memory: its files are read in under the memory share, keyed
  // by the hashes computed from disk while authenticating, so they aren't hashed again.
  async function readDeployFiles({ hashes }: ReadDeployment): Promise<Map<string, Uint8Array>> {
    try {
      const deployFiles = new Map<string, Uint8Array>()
      for (let i = 0; i < uploaded.length; i++) {
        deployFiles.set(hashes[i], await readFile(uploaded[i].path))
      }
      return deployFiles
    } catch (error) {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'error' })
      throw spoolReadFailure(error)
    }
  }

  async function readPartialEntityFile(filePath: string): Promise<Buffer> {
    try {
      return await readFile(filePath)
    } catch (error) {
      metrics.increment('dcl_partial_deployments_staging_total', { kind: 'error' })
      throw spoolReadFailure(error)
    }
  }

  // Logs a spool read failure and maps a transient one to the retryable 503 a spool write failure gets.
  function spoolReadFailure(error: unknown): unknown {
    const code = (error as NodeJS.ErrnoException)?.code
    logger.error(`POST /entities - Failed to read the uploaded files '${error}'`, {
      entityId,
      ethAddress,
      userAgent,
      code: code ?? 'unknown'
    })
    if (!code || !TRANSIENT_SPOOL_READ_ERROR_CODES.has(code)) {
      return error
    }
    metrics.increment('dcl_upload_spool_failures_total', { reason: 'read_error' })
    return new ServiceUnavailableError(SPOOL_UNAVAILABLE_MESSAGE, UPLOAD_UNAVAILABLE_RETRY_AFTER_SECONDS)
  }

  async function deployRegular(deployFiles: Map<string, Uint8Array>, authChain: AuthChain): Promise<Response> {
    try {
      const auditInfo = { authChain, version: 'v3' }

      const deploymentResult = await deployer.deployEntity(deployFiles, entityId, auditInfo, DeploymentContext.LOCAL)

      if (isSuccessfulDeployment(deploymentResult)) {
        metrics.increment('dcl_deployments_endpoint_counter', { kind: 'success' })
        logger.info(`POST /entities - Deployment successful`, { entityId, ethAddress, userAgent })
        return {
          status: 200,
          body: { creationTimestamp: deploymentResult }
        }
      } else if (isInvalidDeployment(deploymentResult)) {
        metrics.increment('dcl_deployments_endpoint_counter', { kind: 'validation_error' })
        logger.error(`POST /entities - Deployment failed (${deploymentResult.errors.join(',')})`, {
          entityId,
          ethAddress,
          userAgent
        })
        return {
          status: 400,
          body: { errors: deploymentResult.errors }
        }
      } else {
        logger.error(`deploymentResult is invalid ${JSON.stringify(deploymentResult)}`)
        throw new Error('deploymentResult is invalid')
      }
    } catch (error) {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'error' })
      // Never log `authChain` or `signature`: they are cryptographic credentials and
      // must not end up in logs/aggregation. `entityId` + `ethAddress` are enough to debug.
      logger.error(`POST /entities - Internal server error '${error}'`, {
        entityId,
        ethAddress,
        userAgent
      })
      logger.error(error)
      throw error
    }
  }

  // Files are hashed from disk; reading the entity file in takes a memory budget share meanwhile.
  async function readDeployment(files: SpooledFile[]): Promise<ReadDeployment | InvalidResult> {
    const entityReadLeases: UploadBudgetLease[] = []
    const sources = files.map(
      (file): DeploymentFileSource => ({
        openStream: () => createReadStream(file.path),
        read: () => {
          entityReadLeases.push(acquireMemory(file.size))
          return readFile(file.path)
        }
      })
    )
    try {
      return await deployer.readDeployment(sources, entityId)
    } finally {
      entityReadLeases.forEach((lease) => lease.release())
    }
  }

  function acquireMemory(bytes: number): UploadBudgetLease {
    try {
      return deploymentMemoryBudget.acquire(bytes)
    } catch (error) {
      if (error instanceof UploadBudgetExceededError) {
        throw new ServiceUnavailableError(error.message, UPLOAD_UNAVAILABLE_RETRY_AFTER_SECONDS)
      }
      throw error
    }
  }

  async function withContentLock(operation: () => Promise<Response>, lockedEntityId: string): Promise<Response> {
    try {
      return await contentLocks.withRead(operation, lockedEntityId)
    } catch (error) {
      if (error instanceof EntityLockTimeoutError) {
        throw new ServiceUnavailableError(error.message)
      }
      throw error
    }
  }
}

function toStagedFile(file: SpooledFile): StagedFile {
  return { size: file.size, openStream: () => createReadStream(file.path) }
}

function inMemoryStagedFile(bytes: Uint8Array): StagedFile {
  return { size: bytes.byteLength, openStream: () => bufferToStream(bytes) }
}

function requireString(val: string): string {
  if (typeof val !== 'string') throw new InvalidRequestError('A string was expected')
  return val
}

function extractAuthChain(fields: Record<string, Field>): AuthLink[] | undefined {
  if (fields[`authChain`]) {
    let parsed: unknown
    try {
      parsed = JSON.parse(fields[`authChain`].value)
    } catch {
      throw new InvalidRequestError('Invalid auth chain')
    }
    // The field is attacker-controlled: reject anything that isn't an array up front so the caller
    // never indexes into a non-array (a number, object, or string would otherwise crash downstream).
    if (!Array.isArray(parsed)) {
      throw new InvalidRequestError('Invalid auth chain')
    }
    // Same cap as the indexed `authChain[N][...]` path below: bound the work handed to
    // AuthChain.validate() / deployer.deployEntity() so the JSON path can't bypass it with a
    // huge array on this public, unauthenticated endpoint.
    if (parsed.length > MAX_AUTH_CHAIN_LENGTH) {
      throw new InvalidRequestError(`Auth chain is too long; the maximum allowed is ${MAX_AUTH_CHAIN_LENGTH} elements`)
    }
    return parsed
  }

  const ret: AuthChain = []

  let biggestIndex = -1

  // find the biggest index
  for (const i in fields) {
    const regexResult = /authChain\[(\d+)\]/.exec(i)
    if (regexResult) {
      biggestIndex = Math.max(biggestIndex, +regexResult[1])
    }
  }

  if (biggestIndex === -1) {
    return undefined
  }

  if (biggestIndex >= MAX_AUTH_CHAIN_LENGTH) {
    throw new InvalidRequestError(`Auth chain is too long; the maximum allowed is ${MAX_AUTH_CHAIN_LENGTH} elements`)
  }

  // fill all the authchain
  for (let i = 0; i <= biggestIndex; i++) {
    const payloadField = fields[`authChain[${i}][payload]`]
    const signatureField = fields[`authChain[${i}][signature]`]
    const typeField = fields[`authChain[${i}][type]`]

    if (!payloadField || !signatureField || !typeField) {
      throw new InvalidRequestError(`Missing auth chain element at index ${i}`)
    }

    ret.push({
      payload: requireString(payloadField.value),
      signature: requireString(signatureField.value),
      type: requireString(typeField.value) as any
    })
  }

  return ret
}
