import { DeploymentToValidate, OK, ValidateFn, ValidationResponse } from '@dcl/content-validator'
import { AuthChain } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'
import { Authenticator } from '@dcl/crypto'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { reconstructAttestationFromAuthChain, validateOwnershipAttestations } from './attestations'

export interface AttestationValidatorConfig {
  baseValidator: ValidateFn
  logger: ILoggerComponent.ILogger
  enabled: boolean
}

export function createAttestationAwareValidator(config: AttestationValidatorConfig): ValidateFn {
  const { baseValidator, logger, enabled } = config

  return async function validate(deployment: DeploymentToValidate): Promise<ValidationResponse> {
    if (!enabled) {
      return baseValidator(deployment)
    }

    if (deployment.entity.type !== EntityType.PROFILE) {
      return baseValidator(deployment)
    }

    const auditInfo = deployment.auditInfo as { attestationAuthChains?: AuthChain[] }
    const attestationAuthChains = auditInfo.attestationAuthChains || []

    if (attestationAuthChains.length === 0) {
      return baseValidator(deployment)
    }

    const attestations = attestationAuthChains
      .map(chain => reconstructAttestationFromAuthChain(chain))
      .filter((att): att is NonNullable<typeof att> => att !== null)

    if (attestations.length === 0) {
      logger.warn(`All attestation AuthChains failed reconstruction`, {
        entityId: deployment.entity.id,
        chainCount: attestationAuthChains.length
      })
      return baseValidator(deployment)
    }

    const deployer = Authenticator.ownerAddress(deployment.auditInfo.authChain)
    // Use entity timestamp for expiry validation — consistent with blockchain
    // time-framed checks and allows syncing Catalysts to validate against
    // the original deployment time
    const timestamp = deployment.entity.timestamp

    const { validUrns, errors } = await validateOwnershipAttestations(attestations, deployer, timestamp)

    if (errors.length > 0) {
      logger.warn(`Some attestations failed validation`, {
        entityId: deployment.entity.id,
        errors: errors.join(', ')
      })
    }

    const metadata = deployment.entity.metadata
    const wearables: string[] = metadata?.avatars?.[0]?.avatar?.wearables || []

    // Attestations use item-level URNs (contract:itemId) while profiles use
    // token-level URNs (contract:itemId:tokenId). Match via prefix.
    const isWearableCoveredByAttestation = (wearableUrn: string): boolean => {
      const normalized = wearableUrn.toLowerCase()
      for (const validUrn of validUrns) {
        if (normalized === validUrn || normalized.startsWith(validUrn + ':')) {
          return true
        }
      }
      return false
    }

    const allWearablesCovered = wearables.every(isWearableCoveredByAttestation)

    if (allWearablesCovered && wearables.length > 0) {
      logger.info(`All wearables covered by attestations, skipping blockchain validation`, {
        entityId: deployment.entity.id,
        wearableCount: wearables.length
      })
      // PoC: return OK directly. In production, run base validator with access checks skipped.
      return OK
    }

    // Strip attested wearables before passing to base validator so it only
    // checks ownership for the remaining ones (e.g. free base wearables).
    const untestedWearables = wearables.filter((w) => !isWearableCoveredByAttestation(w))

    const modifiedMetadata = JSON.parse(JSON.stringify(metadata))
    if (modifiedMetadata?.avatars?.[0]?.avatar?.wearables) {
      modifiedMetadata.avatars[0].avatar.wearables = untestedWearables
    }

    const modifiedDeployment: DeploymentToValidate = {
      ...deployment,
      entity: {
        ...deployment.entity,
        metadata: modifiedMetadata
      }
    }

    return baseValidator(modifiedDeployment)
  }
}
