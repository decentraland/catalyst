import { DeploymentToValidate, ValidateFn, ValidationResponse } from '@dcl/content-validator'
import { EntityType } from '@dcl/schemas'

export interface IContentValidator {
  /** Full deployment validation (structure, signature, access, size, content completeness, ...). */
  validate: ValidateFn
  /**
   * The subset of validations a partial (staging) scene deployment must pass before all of its content
   * is present: everything except the size and content-completeness checks. Entities are expected to be
   * of type SCENE (the caller enforces this).
   *
   * `skipAccessCheck` skips the (slow, on-chain/subgraph) LAND access check. Safe only when the upload
   * already has a non-expired pending record: creating that record required passing the access check,
   * uploaded bytes are hash-verified against the staged manifest, and finalize re-runs the full
   * validation (including access) before anything goes live.
   */
  validateStagingScene(
    deployment: DeploymentToValidate,
    options?: { skipAccessCheck?: boolean }
  ): Promise<ValidationResponse>
  /**
   * Runs ONLY the access check, validated against the CURRENT chain state instead of the block at
   * `entity.timestamp`. The protocol's access validation is historical by design (required to sync and
   * replay old deployments), which is safe for vanilla deploys because REQUEST_TTL_BACKWARDS bounds the
   * entity's age to ~minutes. A partial upload relaxes that bound to PENDING_DEPLOYMENT_TTL, so the
   * deploy pipeline additionally requires access *now* before such an entity goes live — otherwise land
   * traded away mid-upload could still receive the seller's scene at finalize.
   */
  validateCurrentAccess(deployment: DeploymentToValidate): Promise<ValidationResponse>
  /** Per-pointer (per-parcel) size budget in bytes for an entity type, from ADR51. */
  getMaxSizeInBytesPerPointer(type: EntityType): number
}
