import { Authenticator, EthAddress, IdentityType } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { Entity, EntityType } from '@dcl/schemas'
import { DeploymentData, buildEntity } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import fs from 'fs'
import path from 'path'
import { DeploymentContext, DeploymentResult, isInvalidDeployment } from '../../src/deployment-types'
import { retry } from '../../src/helpers/RetryHelper'
import { getEntityFromBuffer } from '../../src/logic/entity-parser'
import { Deployer } from '../../src/ports/deployer'

export async function buildDeployDataAfterEntity(
  afterEntity: { timestamp: number } | { entity: { timestamp: number } },
  pointers: string[],
  options?: Exclude<DeploymentOptions, 'timestamp'>
): Promise<EntityCombo> {
  const after = 'timestamp' in afterEntity ? afterEntity.timestamp : afterEntity.entity.timestamp
  const timestamp = Math.max(options?.timestamp ?? Date.now(), after + 1)
  const opts = Object.assign({ timestamp }, options)
  return buildDeployData(pointers, opts)
}

export async function buildDeployData(pointers: string[], options?: DeploymentOptions): Promise<EntityCombo> {
  const opts = Object.assign(
    {
      version: 'v3',
      type: EntityType.SCENE,
      timestamp: Date.now(),
      metadata: {},
      contentPaths: [],
      identity: createIdentity()
    },
    options
  )
  const buffers: Map<string, Buffer> | undefined =
    opts.contentPaths.length > 0
      ? new Map(opts.contentPaths.map((filePath) => [path.basename(filePath), fs.readFileSync(filePath)]))
      : undefined

  const deploymentPreparationData = await buildEntity({
    ...opts,
    pointers,
    files: buffers
  })
  const [, signature] = hashAndSignMessage(deploymentPreparationData.entityId, opts.identity)
  const authChain = Authenticator.createSimpleAuthChain(
    deploymentPreparationData.entityId,
    opts.identity.address,
    signature
  )

  const content = deploymentPreparationData.files.get(deploymentPreparationData.entityId)
  if (!content) {
    throw new Error('Unexpected error: no content')
  }

  const entity: Entity = getEntityFromBuffer(content, deploymentPreparationData.entityId)

  const deployData: DeploymentData = {
    entityId: entity.id,
    authChain: authChain,
    files: deploymentPreparationData.files
  }

  return { deployData, entity }
}

export function hashAndSignMessage(message: string, identity: IdentityType = createUnsafeIdentity()) {
  const signature = Authenticator.createSignature(identity, message)
  return [identity.address, signature]
}

export function createIdentity(): IdentityType {
  return createUnsafeIdentity()
}

export function deleteFolderRecursive(pathToDelete: string) {
  if (fs.existsSync(pathToDelete)) {
    fs.readdirSync(pathToDelete).forEach((file) => {
      const curPath = path.join(pathToDelete, file)
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath)
      } else {
        // delete file
        fs.unlinkSync(curPath)
      }
    })
    fs.rmdirSync(pathToDelete)
  }
}

export function awaitUntil(
  evaluation: () => Promise<any>,
  attempts: number = 10,
  waitBetweenAttempts: string = '1s'
): Promise<void> {
  return retry(evaluation, attempts, 'perform assertion', waitBetweenAttempts)
}

/** Returns the deployment timestamp of the last deployed entity */
export async function deployEntitiesCombo(
  deployer: Deployer,
  ...entitiesCombo: EntityCombo[]
): Promise<DeploymentResult> {
  let ret: DeploymentResult = { errors: ['empty entities combo'] }
  for (const { deployData } of entitiesCombo) {
    const deploymentResult = await deployer.deployEntity(
      Array.from(deployData.files.values()),
      deployData.entityId,
      {
        authChain: deployData.authChain
      },
      DeploymentContext.LOCAL
    )
    if (typeof deploymentResult == 'number') {
      ret = deploymentResult
    } else if (isInvalidDeployment(deploymentResult)) {
      throw new Error(deploymentResult.errors.join(','))
    } else {
      throw new Error('invalid result from deployEntity ' + JSON.stringify({ deploymentResult, deployData }))
    }
  }
  return ret
}

export type Identity = {
  address: EthAddress
  privateKey: string
}

type DeploymentOptions = {
  type?: EntityType
  timestamp?: number
  metadata: Record<any, any>
  contentPaths?: string[]
  identity?: Identity
}

export type EntityCombo = {
  deployData: DeploymentData
  entity: Entity
}

export function isCI(): boolean {
  return process.env.CI === 'true'
}
