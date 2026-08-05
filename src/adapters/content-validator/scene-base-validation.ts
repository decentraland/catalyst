import { EntityType, SceneParcels } from '@dcl/schemas'
import { ValidateFn, validationFailed } from '@dcl/content-validator'

const SCENE_PARCEL_INTEGRITY_ERROR =
  'The scene base must be included in matching, unique canonical scene parcels and entity pointers.'

function isCanonicalParcelList(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((parcel) => typeof parcel === 'string')) {
    return false
  }

  return SceneParcels.validate({ base: value[0], parcels: value })
}

/**
 * Wraps an access validator with the scene base-parcel invariant that is missing from
 * `Scene.validate` in the currently deployed content-validator version.
 *
 * @param accessValidateFn The configured on-chain, subgraph, or no-op access validator.
 * @returns A validator that rejects an out-of-scene base before invoking the access check.
 */
export function createSceneBaseAwareAccessValidateFn(accessValidateFn: ValidateFn): ValidateFn {
  return async (deployment) => {
    if (deployment.entity.type === EntityType.SCENE) {
      const scene = deployment.entity.metadata?.scene
      const pointers = deployment.entity.pointers
      if (!SceneParcels.validate(scene) || !isCanonicalParcelList(pointers)) {
        return validationFailed(SCENE_PARCEL_INTEGRITY_ERROR)
      }

      const pointerSet = new Set(pointers)
      if (pointerSet.size !== scene.parcels.length || scene.parcels.some((parcel) => !pointerSet.has(parcel))) {
        return validationFailed(SCENE_PARCEL_INTEGRITY_ERROR)
      }
    }

    return accessValidateFn(deployment)
  }
}
