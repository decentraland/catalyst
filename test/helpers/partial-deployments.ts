import { Authenticator, IdentityType } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'
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
