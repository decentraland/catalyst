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
  /** Per-pointer (per-parcel) size budget in bytes for an entity type, from ADR51. */
  getMaxSizeInBytesPerPointer(type: EntityType): number
}
