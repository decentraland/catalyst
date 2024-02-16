import { PostEntity200, PostEntity400 } from '@dcl/catalyst-api-specs/lib/client'
import { Field } from '@well-known-components/multipart-wrapper'
import { AuthChain, Authenticator, AuthLink, EthAddress, Signature } from '@dcl/crypto'
import { DeploymentContext, isInvalidDeployment, isSuccessfulDeployment } from '../../deployment-types'
import { FormHandlerContextWithPath, InvalidRequestError } from '../../types'
import { parseUrn } from '@dcl/urn-resolver'

type ContentFile = {
  path?: string
  content: Buffer
}

type Response = { status: 200; body: PostEntity200 } | { status: 400; body: PostEntity400 }

export const isOldEmote = (wearable: string): boolean => /^[a-z]+$/i.test(wearable)

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

    const entityFile = deployFiles.find((file) => file.path === entityId)
    if (entityFile) {
      const parsedEntity = JSON.parse(entityFile.content.toString())

      function prefix() {
        return `MARIANO ${auditInfo.authChain[0].payload} ${entityId} -`
      }

      let issues = false
      if (parsedEntity.type === 'profile') {
        for (const avatar of parsedEntity?.metadata?.avatars || []) {
          for (const pointer of avatar.avatar.wearables) {
            if (isOldEmote(pointer)) continue

            const parsed = await parseUrn(pointer)
            if (!parsed) {
              issues = true
              console.log(
                `${prefix()} Each profile wearable pointer should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${pointer})`
              )
              continue
            }
            if (
              parsed?.type === 'blockchain-collection-v1-asset' ||
              parsed?.type === 'blockchain-collection-v2-asset'
            ) {
              issues = true
              console.log(
                `${prefix()} Wearable pointer ${pointer} should be an item, not an asset. The URN must include the tokenId.`
              )
            }
          }
        }

        for (const avatar of parsedEntity?.metadata?.avatars || []) {
          const allEmotes = avatar.avatar.emotes ?? []
          for (const { urn } of allEmotes) {
            if (isOldEmote(urn)) continue
            const parsed = await parseUrn(urn)
            if (!parsed) {
              issues = true
              console.log(
                `${prefix()} Each profile emote pointer should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${urn})`
              )
              continue
            }
            if (
              parsed?.type === 'blockchain-collection-v1-asset' ||
              parsed?.type === 'blockchain-collection-v2-asset'
            ) {
              issues = true
              console.log(
                `${prefix()} Emote pointer ${urn} should be an item, not an asset. The URN must include the tokenId.`
              )
            }
          }
        }
      }

      if (issues) {
        console.log(`${prefix()} referer: ${context.request.headers.get('referer')}`)
        console.log(`${prefix()} user-agent: ${context.request.headers.get('user-agent')}`)
      }
    }

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
