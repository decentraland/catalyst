import fs from 'fs'
import path from 'path'
import EthCrypto from 'eth-crypto'
import {
  Pointer,
  EntityType,
  Entity as ControllerEntity,
  EntityId,
  Timestamp,
  ContentFileHash,
  EntityVersion
} from 'dcl-catalyst-commons'
import { Authenticator, EthAddress, AuthChain } from 'dcl-crypto'
import { retry } from '@katalyst/content/helpers/RetryHelper'
import { Entity } from '@katalyst/content/service/Entity'
import { DeploymentBuilder } from 'dcl-catalyst-client'
import { EntityFactory } from '@katalyst/content/service/EntityFactory'
import { ControllerEntityFactory } from '@katalyst/content/controller/ControllerEntityFactory'
import { MetaverseContentService } from '@katalyst/content/service/Service'
import { ContentFile } from '@katalyst/content/controller/Controller'

export async function buildDeployDataAfterEntity(
  afterEntity: { timestamp: Timestamp } | { entity: { timestamp: Timestamp } },
  pointers: Pointer[],
  options?: Exclude<DeploymentOptions, 'timestamp'>
): Promise<EntityCombo> {
  const after = 'timestamp' in afterEntity ? afterEntity.timestamp : afterEntity.entity.timestamp
  const timestamp = Math.max(options?.timestamp ?? Date.now(), after + 1)
  const opts = Object.assign({ timestamp }, options)
  return buildDeployData(pointers, opts)
}

export async function buildDeployData(pointers: Pointer[], options?: DeploymentOptions): Promise<EntityCombo> {
  const opts = Object.assign(
    {
      type: EntityType.SCENE,
      timestamp: Date.now(),
      metadata: 'metadata',
      contentPaths: [],
      identity: createIdentity()
    },
    options
  )
  const buffers: Map<string, Buffer> | undefined =
    opts.contentPaths.length > 0
      ? new Map(opts.contentPaths.map((filePath) => [path.basename(filePath), fs.readFileSync(filePath)]))
      : undefined

  const deploymentPreparationData = await DeploymentBuilder.buildEntity(
    opts.type,
    pointers,
    buffers,
    opts.metadata,
    opts.timestamp
  )
  const [, signature] = hashAndSignMessage(deploymentPreparationData.entityId, opts.identity)
  const authChain = Authenticator.createSimpleAuthChain(
    deploymentPreparationData.entityId,
    opts.identity.address,
    signature
  )

  const entity: Entity = EntityFactory.fromFile(
    deploymentPreparationData.files.get(deploymentPreparationData.entityId)!!,
    deploymentPreparationData.entityId
  )

  if (!entity.content || entity.content.size === 0) {
    delete entity.content
  }

  const deployData: DeployData = {
    entityId: entity.id,
    authChain: authChain,
    files: deploymentPreparationData.files
  }

  const controllerEntity = ControllerEntityFactory.maskEntity(entity)

  if (!controllerEntity.content || controllerEntity.content.length === 0) {
    delete controllerEntity.content
  }

  return { deployData, entity, controllerEntity }
}

export function hashAndSignMessage(message: string, identity: Identity = createIdentity()) {
  const messageHash = Authenticator.createEthereumMessageHash(message)
  const signature = EthCrypto.sign(identity.privateKey, messageHash)
  return [identity.address, signature]
}

export function createIdentity(): Identity {
  return EthCrypto.createIdentity()
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
  service: MetaverseContentService,
  ...entitiesCombo: EntityCombo[]
): Promise<Timestamp> {
  let timestamp: Timestamp = 0
  for (const { deployData } of entitiesCombo) {
    timestamp = await service.deployEntity(
      Array.from(deployData.files.values()),
      deployData.entityId,
      { authChain: deployData.authChain, version: EntityVersion.V2 },
      ''
    )
  }
  return timestamp
}

export type DeployData = {
  entityId: EntityId
  authChain: AuthChain
  files: Map<ContentFileHash, ContentFile>
}

export type Identity = {
  address: EthAddress
  privateKey: string
}

type DeploymentOptions = {
  type?: EntityType
  timestamp?: Timestamp
  metadata?: any
  contentPaths?: string[]
  identity?: Identity
}

export type EntityCombo = {
  deployData: DeployData
  controllerEntity: ControllerEntity
  entity: Entity
}
