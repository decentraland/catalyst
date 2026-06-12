import { PostEntity200, PostEntity400 } from '@dcl/catalyst-api-specs/lib/client'
import { Field } from '@well-known-components/multipart-wrapper'
import { AuthChain, Authenticator, AuthLink, EthAddress, Signature } from '@dcl/crypto'
import { DeploymentContext, isInvalidDeployment, isSuccessfulDeployment } from '../../deployment-types'
import { FormHandlerContextWithPath } from '../../types'
import { InvalidRequestError } from '../errors'

// A real auth chain has 2-3 links; cap generously. This bounds the index-parsing loop below so a
// crafted `authChain[<huge>][...]` field name can't drive a large iteration count on the public,
// unauthenticated POST /entities endpoint (issue #1936).
const MAX_AUTH_CHAIN_LENGTH = 10

type ContentFile = {
  path?: string
  content: Buffer
}

type Response = { status: 200; body: PostEntity200 } | { status: 400; body: PostEntity400 }

// Method: POST
export async function createEntity(
  context: FormHandlerContextWithPath<'logs' | 'fs' | 'metrics' | 'deployer', '/entities'>
): Promise<Response> {
  const { metrics, deployer, logs } = context.components

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

  let authChain = extractAuthChain(context.formData.fields)
  // Null-safe: a client-supplied `authChain` JSON can parse to an array whose first element is
  // missing or not an object (e.g. `[]`, `[null]`). Reading `.payload` directly would throw a
  // TypeError here — before the try/catch below — and surface as a 500. The structural check is
  // left to AuthChain.validate(), which returns a clean 400.
  const ethAddress: EthAddress = authChain?.[0]?.payload ?? ''
  const signature: Signature = context.formData.fields.signature?.value

  if (authChain) {
    if (!AuthChain.validate(authChain)) {
      throw new InvalidRequestError('Invalid auth chain')
    }
  } else if (ethAddress && signature) {
    authChain = Authenticator.createSimpleAuthChain(entityId, ethAddress, signature)
  } else {
    throw new InvalidRequestError('No auth chain can be derivated')
  }

  const deployFiles: ContentFile[] = []
  try {
    for (const filename of Object.keys(context.formData.files)) {
      const file = context.formData.files[filename]
      deployFiles.push({ path: filename, content: file.value })
    }

    const auditInfo = { authChain, version: 'v3' }

    const deploymentResult = await deployer.deployEntity(
      deployFiles.map(({ content }) => content),
      entityId,
      auditInfo,
      DeploymentContext.LOCAL
    )

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
