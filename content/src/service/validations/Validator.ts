import { ContentFileHash, DeploymentFilters, EntityId, EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { AccessChecker } from '../access/AccessChecker'
import { ContentAuthenticator } from '../auth/Authenticator'
import { Deployment } from '../deployments/DeploymentManager'
import { Entity } from '../Entity'
import { DeploymentStatus } from '../errors/FailedDeploymentsManager'
import { DeploymentContext, LocalDeploymentAuditInfo } from '../Service'
import { VALIDATIONS_V2 } from './validations/ValidationsV2'
import { VALIDATIONS_V3 } from './validations/ValidationsV3'
import { VALIDATIONS_V4 } from './validations/ValidationsV4'

export interface Validator {
  validate(
    deployment: DeploymentToValidate,
    context: DeploymentContext,
    calls: ExternalCalls
  ): Promise<{ ok: true } | { ok: false; errors: Errors }>
}

export class ValidatorImpl implements Validator {
  private static readonly VALIDATIONS: ValidationsForVersion = {
    [EntityVersion.V2]: VALIDATIONS_V2,
    [EntityVersion.V3]: VALIDATIONS_V3,
    [EntityVersion.V4]: VALIDATIONS_V4
  }

  constructor(private readonly env: ServerEnvironment) {}

  async validate(
    deployment: DeploymentToValidate,
    context: DeploymentContext,
    calls: ExternalCalls
  ): Promise<{ ok: true } | { ok: false; errors: Errors }> {
    const validationsForVersion = ValidatorImpl.VALIDATIONS[deployment.entity.version]
    if (!validationsForVersion) {
      return { ok: false, errors: [`Unknown entity version ${deployment.entity.version}`] }
    }
    const validationsForContext = validationsForVersion[context]
    if (!validationsForContext) {
      return { ok: false, errors: [`Unknown deployment context ${context}`] }
    }

    const errors: Errors = []
    for (const validation of validationsForContext) {
      const result = await validation({ deployment, env: this.env, externalCalls: calls })
      if (result) {
        errors.push(...result)
      }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true }
  }
}

// Determines the validations that need to be used, based on the entity's version
type ValidationsForVersion = { [Version in EntityVersion]: ValidationsForContext }

// Determines the validations that need to be executed, based on the deployment's context
export type ValidationsForContext = { [Context in DeploymentContext]: Validation[] }

export type DeploymentToValidate = {
  entity: Entity
  files: Map<ContentFileHash, Buffer>
  auditInfo: LocalDeploymentAuditInfo
}

export type ServerEnvironment = {
  accessChecker: AccessChecker
  authenticator: ContentAuthenticator
  requestTtlBackwards: number
  maxUploadSizePerTypeInMB: Map<EntityType, number>
}

export type ExternalCalls = {
  fetchDeployments: (filters: DeploymentFilters) => Promise<{ deployments: Deployment[] }>
  areThereNewerEntities: (entity: Entity) => Promise<boolean>
  fetchDeploymentStatus: (entityType: EntityType, entityId: EntityId) => Promise<DeploymentStatus>
  isContentStoredAlready: (hashes: ContentFileHash[]) => Promise<Map<ContentFileHash, boolean>>
  isEntityDeployedAlready: (entityId: EntityId) => Promise<boolean>
  isEntityRateLimited: (entity: Entity) => Promise<boolean>
  fetchContentFileSize: (hash: string) => Promise<number | undefined>
}

// Will return undefined if the deployment is valid
export type Validation = (args: ValidationArgs) => undefined | Errors | Promise<undefined | Errors>

export type ValidationArgs = {
  deployment: DeploymentToValidate
  env: ServerEnvironment
  externalCalls: ExternalCalls
}

type Errors = string[]
