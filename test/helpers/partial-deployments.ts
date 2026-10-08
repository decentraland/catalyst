import { Authenticator, IdentityType } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { AuthChain, AuthLinkType, EntityType } from '@dcl/schemas'
import { buildEntity } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import FormData = require('form-data')
import { TestProgram } from '../integration/TestProgram'

export type PreparedDeployment = {
  entityId: string
  authChain: ReturnType<typeof Authenticator.createSimpleAuthChain>
  files: Map<string, Uint8Array>
  contentHashes: string[]
}

export async function prepareSceneDeployment(
  pointers: string[],
  contents: Record<string, Buffer>,
  identity: IdentityType,
  timestamp: number = Date.now()
): Promise<PreparedDeployment> {
  const files = new Map<string, Uint8Array>(Object.entries(contents))
  const prepared = await buildEntity({
    type: EntityType.SCENE,
    pointers,
    files,
    metadata: { main: 'bin/main.js', scene: { base: pointers[0], parcels: pointers } },
    timestamp
  })
  const signature = Authenticator.createSignature(identity, prepared.entityId)
  const authChain = Authenticator.createSimpleAuthChain(prepared.entityId, identity.address, signature)
  const contentHashes = Array.from(prepared.files.keys()).filter((k) => k !== prepared.entityId)
  return { entityId: prepared.entityId, authChain, files: prepared.files, contentHashes }
}

/** The same deployment signed by the same owner through an ephemeral key that has already expired. */
export function withExpiredAuthChain(
  deployment: PreparedDeployment,
  identity: IdentityType,
  expiredMinutesAgo = 1
): PreparedDeployment {
  const authChain = Authenticator.createAuthChain(
    identity,
    createUnsafeIdentity(),
    -expiredMinutesAgo,
    deployment.entityId
  )
  return { ...deployment, authChain }
}

/**
 * The same deployment signed by `identity` through a chain of `links` links: the signer, `links - 2`
 * ephemeral hops and the signed entity. The first ephemeral payload's free-text line is padded so the
 * payload takes `firstEphemeralPayloadBytes` bytes, still forming a valid chain.
 */
export function withAuthChainOf(
  deployment: PreparedDeployment,
  identity: IdentityType,
  links: number,
  firstEphemeralPayloadBytes?: number
): PreparedDeployment {
  const expiration = new Date(Date.now() + 10 * 60 * 1000)
  const authChain: AuthChain = [{ type: AuthLinkType.SIGNER, payload: identity.address, signature: '' }]
  let authority = identity
  for (let hop = 0; hop < links - 2; hop++) {
    const ephemeral = createUnsafeIdentity()
    let message = Authenticator.getEphemeralMessage(ephemeral.address, expiration)
    if (hop === 0 && firstEphemeralPayloadBytes !== undefined) {
      message = 'x'.repeat(firstEphemeralPayloadBytes - Buffer.byteLength(message)) + message
    }
    authChain.push({
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload: message,
      signature: Authenticator.createSignature(authority, message)
    })
    authority = ephemeral
  }
  authChain.push({
    type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
    payload: deployment.entityId,
    signature: Authenticator.createSignature(authority, deployment.entityId)
  })
  return { ...deployment, authChain }
}

/** Builds a partial request with one field per auth-chain link property, as dcl-catalyst-client sends it. */
export function buildIndexedPartialForm(deployment: PreparedDeployment, keysToInclude: string[]): FormData {
  const form = new FormData()
  form.append('entityId', deployment.entityId)
  form.append('partial', 'true')
  deployment.authChain.forEach((link, i) => {
    form.append(`authChain[${i}][type]`, link.type)
    form.append(`authChain[${i}][payload]`, link.payload)
    form.append(`authChain[${i}][signature]`, link.signature ?? '')
  })
  for (const key of keysToInclude) {
    form.append(key, Buffer.from(deployment.files.get(key)!), { filename: key })
  }
  return form
}

export function buildPartialForm(deployment: PreparedDeployment, keysToInclude: string[], partial = true): FormData {
  const form = new FormData()
  form.append('entityId', deployment.entityId)
  if (partial) {
    form.append('partial', 'true')
  }
  form.append('authChain', JSON.stringify(deployment.authChain))
  for (const key of keysToInclude) {
    const content = deployment.files.get(key)
    if (!content) {
      throw new Error(`Test setup error: no file for key ${key}`)
    }
    form.append(key, Buffer.from(content), { filename: key })
  }
  return form
}

export async function postForm(server: TestProgram, form: FormData): Promise<Response> {
  return fetch(server.getUrl() + '/entities', {
    method: 'POST',
    body: form.getBuffer(),
    headers: form.getHeaders()
  })
}
