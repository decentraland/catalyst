import { Avatar, Profile, Scene, Wearable } from '@dcl/schemas'
import { EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import ms from 'ms'
import { Entity } from '../Entity'
import { DeploymentStatus, NoFailure } from '../errors/FailedDeploymentsManager'
import { ServiceImpl } from '../ServiceImpl'
import { happenedBefore } from '../time/TimeSorting'
import { ExternalCalls, Validation } from './Validator'

export class Validations {
  /** Validate that the signature belongs to the Ethereum address */
  static readonly SIGNATURE: Validation = async ({ deployment, env }) => {
    const { entity, auditInfo } = deployment
    const validationResult = await env.authenticator.validateSignature(entity.id, auditInfo.authChain, entity.timestamp)
    return !validationResult.ok ? ['The signature is invalid. ' + validationResult.message] : undefined
  }

  /** Validate that the full request size is within limits */
  static readonly REQUEST_SIZE_V3: Validation = ({ deployment, env }) => {
    const { entity } = deployment
    const maxSizeInMB = env.maxUploadSizePerTypeInMB.get(entity.type)
    if (!maxSizeInMB) {
      return [`Type ${entity.type} is not supported yet`]
    }
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024
    let totalSize = 0

    deployment.files.forEach((file) => (totalSize += file.byteLength))
    const sizePerPointer = totalSize / entity.pointers.length
    if (sizePerPointer > maxSizeInBytes) {
      return [
        `The deployment is too big. The maximum allowed size per pointer is ${maxSizeInMB} MB for ${
          entity.type
        }. You can upload up to ${entity.pointers.length * maxSizeInBytes} bytes but you tried to upload ${totalSize}.`
      ]
    }
  }

  /** Validate that the pointers are valid, and that the Ethereum address has write access to them */
  static readonly ACCESS: Validation = ({ deployment, env }) => {
    const { entity, auditInfo } = deployment
    return env.accessChecker.hasAccess({ ...entity, ethAddress: Authenticator.ownerAddress(auditInfo.authChain) })
  }

  // Validate that entity is actually ok
  static readonly ENTITY_STRUCTURE: Validation = ({ deployment }) => {
    const { entity } = deployment
    if (new Set(entity.pointers).size != entity.pointers.length) {
      return ['There are repeated pointers in your request.']
    } else if (!entity.pointers || entity.pointers.length <= 0) {
      return ['The entity needs to be pointed by one or more pointers.']
    }
  }

  /** Validate that there are no newer deployments on the entity's pointers */
  static readonly NO_NEWER: Validation = async ({ deployment, externalCalls }) => {
    // Validate that pointers aren't referring to an entity with a higher timestamp
    if (await externalCalls.areThereNewerEntities(deployment.entity)) {
      return ['There is a newer entity pointed by one or more of the pointers you provided.']
    }
  }

  private static REQUEST_TTL_FORWARDS: number = ms('15m')
  /** Validate that the deployment is recent */
  static readonly RECENT: Validation = ({ deployment, env }) => {
    // Verify that the timestamp is recent enough. We need to make sure that the definition of recent works with the synchronization mechanism
    const delta = Date.now() - deployment.entity.timestamp
    if (delta > env.requestTtlBackwards) {
      return ['The request is not recent enough, please submit it again with a new timestamp.']
    } else if (delta < -Validations.REQUEST_TTL_FORWARDS) {
      return ['The request is too far in the future, please submit it again with a new timestamp.']
    }
  }

  /** Validate if the entity can be re deployed or not */
  static readonly NO_REDEPLOYS: Validation = async ({ deployment, externalCalls }) => {
    if (await externalCalls.isEntityDeployedAlready(deployment.entity.id)) {
      return [`This entity was already deployed. You can't redeploy it`]
    }
  }

  /** Make sure that the deployment actually failed, and that it can be re-deployed */
  static readonly MUST_HAVE_FAILED_BEFORE: Validation = async ({ deployment, externalCalls }) => {
    const { type, id } = deployment.entity
    const deploymentStatus: DeploymentStatus = await externalCalls.fetchDeploymentStatus(type, id)
    if (deploymentStatus === NoFailure.NOT_MARKED_AS_FAILED) {
      return [`You are trying to fix an entity that is not marked as failed`]
    }
  }

  /** Validate that there is no entity with a higher version already deployed that the legacy entity is trying to overwrite */
  static readonly LEGACY_ENTITY: Validation = async ({ deployment, externalCalls }) => {
    const { entity: entityToBeDeployed, auditInfo: auditInfoBeingDeployed } = deployment
    if (
      auditInfoBeingDeployed.migrationData &&
      auditInfoBeingDeployed.migrationData.originalVersion === EntityVersion.V2
    ) {
      const { deployments } = await externalCalls.fetchDeployments({
        entityTypes: [entityToBeDeployed.type],
        pointers: entityToBeDeployed.pointers,
        onlyCurrentlyPointed: true
      })
      for (const currentDeployment of deployments) {
        const currentAuditInfo = currentDeployment.auditInfo
        if (happenedBefore(currentDeployment, entityToBeDeployed)) {
          if (currentAuditInfo.version > entityToBeDeployed.version) {
            return [`Found an overlapping entity with a higher version already deployed.`]
          } else if (currentAuditInfo.version == entityToBeDeployed.version && auditInfoBeingDeployed.migrationData) {
            if (!currentAuditInfo.migrationData) {
              return [`Found an overlapping entity with a higher version already deployed.`]
            } else if (
              currentAuditInfo.migrationData.originalVersion > auditInfoBeingDeployed.migrationData.originalVersion
            ) {
              return [`Found an overlapping entity with a higher version already deployed.`]
            }
          }
        }
      }
    } else {
      return [`Found a legacy entity without original metadata or the original version might not be considered legacy.`]
    }
  }

  /** Validate that uploaded and reported hashes are corrects */
  static readonly CONTENT_V3: Validation = async ({ deployment, externalCalls }) => {
    const { entity, files } = deployment
    const errors: string[] = await this.validate_content_v3(entity, files, externalCalls)
    return errors.length > 0 ? errors : undefined
  }

  private static async validate_content_v3(
    entity: Entity,
    files: Map<string, Buffer>,
    externalCalls: ExternalCalls
  ): Promise<string[]> {
    const errors: string[] = []
    if (entity.content) {
      const alreadyStoredHashes = await externalCalls.isContentStoredAlready(Array.from(files.keys()))

      for (const [, hash] of entity.content) {
        // Validate that all hashes in entity were uploaded, or were already stored on the service
        if (!(files.has(hash) || alreadyStoredHashes.get(hash))) {
          errors.push(`This hash is referenced in the entity but was not uploaded or previously available: ${hash}`)
        }
      }
    }

    // Validate that all hashes that belong to uploaded files are actually reported on the entity
    const entityHashes = new Set(entity.content?.values() ?? [])
    for (const [hash] of files) {
      if (!entityHashes.has(hash) && hash !== entity.id) {
        errors.push(`This hash was uploaded but is not referenced in the entity: ${hash}`)
      }
    }
    return errors
  }

  /** Validate that uploaded and reported hashes are corrects and files corresponds to snapshots */
  static readonly CONTENT_V4: Validation = async ({ deployment, externalCalls }) => {
    const { entity, files } = deployment
    const errors: string[] = await this.validate_content_v3(entity, files, externalCalls)

    if (entity.content) {
      for (const [fileName, hash] of entity.content) {
        // Validate all content files correspond to at least one avatar snapshot
        if (entity.type === EntityType.PROFILE) {
          if (!Validations.correspondsToASnapshot(fileName, hash, entity.metadata)) {
            errors.push(
              `This file is not expected: '${fileName}' or its hash is invalid: '${hash}'. Please, include only valid snapshot files.`
            )
          }
        }
      }
    }
    return errors.length > 0 ? errors : undefined
  }

  /** Validate that the address used was owned by Decentraland */
  static readonly DECENTRALAND_ADDRESS: Validation = ({ deployment, env }) => {
    const address = Authenticator.ownerAddress(deployment.auditInfo.authChain)
    if (!env.authenticator.isAddressOwnedByDecentraland(address)) {
      return [`Expected an address owned by decentraland. Instead, we found ${address}`]
    }
  }

  /** Validate that all hashes used by the entity were actually IPFS hashes */
  static readonly IPFS_HASHING: Validation = ({ deployment }) => {
    const { entity } = deployment

    const hashesInContent = Array.from(entity.content?.values() ?? [])
    const allHashes = [entity.id, ...hashesInContent]

    const errors: string[] = allHashes
      .filter((hash) => !ServiceImpl.isIPFSHash(hash))
      .map((hash) => `This hash '${hash}' is not valid. It should be IPFS v2 format.`)

    return errors.length > 0 ? errors : undefined
  }

  static readonly FAIL_ALWAYS: Validation = async () => {
    return ['This deployment is invalid. What are you doing?']
  }

  static readonly METADATA_SCHEMA: Validation = async ({ deployment }) => {
    const validate = {
      [EntityType.PROFILE]: Profile.validate,
      [EntityType.SCENE]: Scene.validate,
      [EntityType.WEARABLE]: Wearable.validate
    }

    if (!validate[deployment.entity.type](deployment.entity.metadata))
      return [`The metadata for this entity type (${deployment.entity.type}) is not valid.`]
  }

  /** Validate the deployment is not rate limited */
  static readonly RATE_LIMIT: Validation = async ({ deployment, externalCalls }) => {
    if (await externalCalls.isEntityRateLimited(deployment.entity)) {
      return [`The entity with id (${deployment.entity.id}) has been rate limited.`]
    }
  }

  static readonly REQUEST_SIZE_V4: Validation = async ({ deployment, env, externalCalls }) => {
    const { entity } = deployment
    const maxSizeInMB = env.maxUploadSizePerTypeInMB.get(entity.type)
    if (!maxSizeInMB) {
      return [`Type ${entity.type} is not supported yet`]
    }
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024

    let totalSize = 0

    for (const [, hash] of entity.content ?? []) {
      const uploadedFile = deployment.files.get(hash)
      totalSize += uploadedFile?.byteLength ?? (await externalCalls.fetchContentFileSize(hash))
    }

    const sizePerPointer = totalSize / entity.pointers.length
    if (sizePerPointer > maxSizeInBytes) {
      return [
        `The deployment is too big. The maximum allowed size per pointer is ${maxSizeInMB} MB for ${
          entity.type
        }. You can upload up to ${entity.pointers.length * maxSizeInBytes} bytes but you tried to upload ${totalSize}.`
      ]
    }
  }

  private static correspondsToASnapshot(fileName: string, hash: string, metadata: Profile) {
    const fileNameWithoutExtension = fileName.replace(/.[^/.]+$/, '')

    return metadata.avatars.some((avatar: Avatar) => {
      console.debug(
        `Snapshot file: ${fileNameWithoutExtension} - hash: ${avatar.avatar.snapshots[fileNameWithoutExtension]}`
      )
      return avatar.avatar.snapshots[fileNameWithoutExtension] === hash
    })
  }
}
