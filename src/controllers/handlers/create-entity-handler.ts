import { PostEntity200, PostEntity400 } from '@dcl/catalyst-api-specs/lib/client'
import { Field } from '@well-known-components/multipart-wrapper'
import { AuthChain, AuthLink, EthAddress } from '@dcl/crypto'
import { DeploymentContext, isInvalidDeployment, isSuccessfulDeployment } from '../../deployment-types'
import { createReadStream } from 'fs'
import { readFile } from 'fs/promises'
import { EntityLockTimeoutError } from '../../adapters/content-locks'
import { UploadBudgetExceededError, UploadBudgetLease } from '../../adapters/upload-budget'
import { InvalidPartialDeploymentError, MAX_ENTITY_FILE_SIZE_BYTES, StagedFile } from '../../logic/partial-deployments'
import { DeploymentFileSource, ReadDeployment } from '../../logic/deployment-service/types'
import { FormHandlerContextWithPath, SpooledFile } from '../../types'
import { InvalidRequestError, ServiceUnavailableError } from '../errors'

/** Body of a 202 response to a partial deployment request: the content hashes not yet on the server. */
type PostEntity202 = { missing: string[] }

// A real auth chain has 2-3 links; cap generously. This bounds the index-parsing loop below so a
// crafted `authChain[<huge>][...]` field name can't drive a large iteration count on the public,
// unauthenticated POST /entities endpoint (issue #1936).
const MAX_AUTH_CHAIN_LENGTH = 10

type Response =
  | { status: 200; body: PostEntity200 }
  | { status: 202; body: PostEntity202 }
  | { status: 400 | 429; body: PostEntity400; headers?: Record<string, string> }

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
  >
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
      metrics.increment('dcl_partial_deployments_staging_total', { kind: 'finalized' })
    } else {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'success' })
    }
    logger.info(`POST /entities - Entity already deployed`, { entityId, ethAddress, userAgent })
    return { status: 200, body: { creationTimestamp: deployedTimestamp } }
  }

  // Authenticate before taking any lock, so a request that can't be authenticated never holds a lock
  // connection. Same check, expiry date (the entity's timestamp) and message as the deployment validator.
  const uploaded = Object.values(context.formData.files)
  let regularDeployment: ReadDeployment | undefined
  let signatureDate: number
  if (isPartial) {
    // Only an entity file within staging's size cap is read, as staging itself does.
    const entityFile = context.formData.files[entityId]
    const read =
      entityFile && entityFile.size <= MAX_ENTITY_FILE_SIZE_BYTES
        ? await deployer.readDeployment([toStagedFile(entityFile)], entityId)
        : undefined
    // A batch without a readable entity file is a resume, whose storage read-back needs a chain valid now.
    signatureDate = read && !isInvalidDeployment(read) ? read.entity.timestamp : Date.now()
  } else {
    // Files are hashed from disk; reading the entity file in takes a memory budget share meanwhile.
    const entityReadLeases: UploadBudgetLease[] = []
    const sources = uploaded.map(
      (file): DeploymentFileSource => ({
        openStream: () => createReadStream(file.path),
        read: () => {
          entityReadLeases.push(acquireMemory(file.size))
          return readFile(file.path)
        }
      })
    )
    let read: Awaited<ReturnType<typeof deployer.readDeployment>>
    try {
      read = await deployer.readDeployment(sources, entityId)
    } finally {
      entityReadLeases.forEach((lease) => lease.release())
    }
    if (isInvalidDeployment(read)) {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'validation_error' })
      logger.error(`POST /entities - Deployment failed (${read.errors.join(',')})`, { entityId, ethAddress, userAgent })
      return { status: 400, body: { errors: read.errors } }
    }
    regularDeployment = read
    signatureDate = read.entity.timestamp
  }
  const signature = await crypto.validateSignature(entityId, authChain, signatureDate)
  if (!signature.ok) {
    return { status: 400, body: { errors: [`The signature is invalid. ${signature.message}`] } }
  }

  // Every deployment holds the shared content lock through publication, so garbage collection can't
  // delete content it stores or reuses; batches of one entity are serialized.
  return withContentLock(async (): Promise<Response> => {
    // A `partial=true` field marks a staging request of a multi-request (partial) deployment: the
    // content may be uploaded across several requests and the entity only becomes live once all of it is
    // present. Requests without the flag behave exactly as before.
    if (isPartial) {
      // Preserve the field-name keys (content hashes): unlike the vanilla path, they are load-bearing.
      // The files stay on disk; staging streams them.
      const files = new Map<string, StagedFile>()
      for (const filename of Object.keys(context.formData.files)) {
        files.set(filename, toStagedFile(context.formData.files[filename]))
      }

      try {
        const result = await partialDeployments.stageDeployment({ entityId, authChain, files })
        if (result.kind === 'deployed') {
          metrics.increment('dcl_partial_deployments_staging_total', { kind: 'finalized' })
          logger.info(`POST /entities - Partial deployment finalized`, { entityId, ethAddress, userAgent })
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
          metrics.increment('dcl_partial_deployments_staging_total', { kind: 'validation_error' })
          logger.error(`POST /entities - Partial deployment failed (${error.errors.join(',')})`, {
            entityId,
            ethAddress,
            userAgent
          })
          // statusCode is 429 for transient conditions (rate limiting), 400 for validation errors. On a
          // 429 with a known window, send Retry-After so the client waits it out instead of exhausting its
          // resume budget inside the window.
          const headers =
            error.statusCode === 429 && error.retryAfterSeconds !== undefined
              ? { 'Retry-After': String(error.retryAfterSeconds) }
              : undefined
          return { status: error.statusCode, body: { errors: error.errors }, headers }
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

    // The regular deploy pipeline validates from memory, so reading the files in takes a memory budget
    // share, released once the deployment settles.
    const memoryLease = acquireMemory(uploaded.reduce((sum, file) => sum + file.size, 0))
    try {
      // Keyed by the hashes computed from disk while authenticating, so they aren't hashed again.
      const { hashes } = regularDeployment!
      const deployFiles = new Map<string, Uint8Array>()
      for (let i = 0; i < uploaded.length; i++) {
        deployFiles.set(hashes[i], await readFile(uploaded[i].path))
      }

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
    } finally {
      memoryLease.release()
    }
  }, entityId)

  function acquireMemory(bytes: number): UploadBudgetLease {
    try {
      return deploymentMemoryBudget.acquire(bytes)
    } catch (error) {
      if (error instanceof UploadBudgetExceededError) {
        throw new ServiceUnavailableError(error.message)
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
  return {
    size: file.size,
    openStream: () => createReadStream(file.path),
    read: () => readFile(file.path)
  }
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
