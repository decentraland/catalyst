import { PostEntity200, PostEntity400 } from '@dcl/catalyst-api-specs/lib/client'
import { Field } from '@well-known-components/multipart-wrapper'
import { AuthChain, Authenticator, AuthLink, EthAddress, Signature } from '@dcl/crypto'
import { DeploymentContext, isInvalidDeployment, isSuccessfulDeployment } from '../../deployment-types.js'
import { FormHandlerContextWithPath, InvalidRequestError } from '../../types.js'

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
  const entityId: string = context.formData.fields.entityId.value

  let authChain = extractAuthChain(context.formData.fields)
  const ethAddress: EthAddress = authChain ? authChain[0].payload : ''
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
      return {
        status: 200,
        body: { creationTimestamp: deploymentResult }
      }
    } else if (isInvalidDeployment(deploymentResult)) {
      metrics.increment('dcl_deployments_endpoint_counter', { kind: 'validation_error' })
      logger.error(`POST /entities - Deployment failed (${deploymentResult.errors.join(',')})`)
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
    logger.error(`POST /entities - Internal server error '${error}'`, {
      entityId,
      authChain: JSON.stringify(authChain),
      ethAddress,
      signature
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
    return JSON.parse(fields[`authChain`].value)
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

  // fill all the authchain
  for (let i = 0; i <= biggestIndex; i++) {
    ret.push({
      payload: requireString(fields[`authChain[${i}][payload]`].value),
      signature: requireString(fields[`authChain[${i}][signature]`].value),
      type: requireString(fields[`authChain[${i}][type]`].value) as any
    })
  }

  return ret
}
