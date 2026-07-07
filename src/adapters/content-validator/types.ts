import { ValidateFn } from '@dcl/content-validator'
import { EntityType } from '@dcl/schemas'

export interface IContentValidator {
  /** Full deployment validation (structure, signature, access, size, content completeness, ...). */
  validate: ValidateFn
  /**
   * The subset of validations a partial (staging) scene deployment must pass before all of its content
   * is present: everything except the size and content-completeness checks. Entities are expected to be
   * of type SCENE (the caller enforces this).
   */
  validateStagingScene: ValidateFn
  /** Per-pointer (per-parcel) size budget in bytes for an entity type, from ADR51. */
  getMaxSizeInBytesPerPointer(type: EntityType): number
}
