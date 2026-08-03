import { EntityType } from '@dcl/schemas'
import { ValidateFn, validationFailed } from '@dcl/content-validator'

const PARCEL_COORDINATE_PATTERN = /^(?:0|-?[1-9]\d*),(?:0|-?[1-9]\d*)$/
const MAX_SCENE_PARCELS = 1000

function isCanonicalParcelList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_SCENE_PARCELS &&
    value.every(
      (parcel): parcel is string =>
        typeof parcel === 'string' && parcel.length <= 32 && PARCEL_COORDINATE_PATTERN.test(parcel)
    ) &&
    new Set(value).size === value.length
  )
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
      const base = scene?.base
      const pointers = deployment.entity.pointers
      const parcels = scene?.parcels
      const sameParcels =
        isCanonicalParcelList(pointers) &&
        isCanonicalParcelList(parcels) &&
        pointers.length === parcels.length &&
        parcels.every((parcel) => pointers.includes(parcel))

      if (
        typeof base !== 'string' ||
        !PARCEL_COORDINATE_PATTERN.test(base) ||
        !sameParcels ||
        !parcels.includes(base)
      ) {
        return validationFailed(
          'The scene base must be included in matching, unique canonical scene parcels and entity pointers.'
        )
      }
    }

    return accessValidateFn(deployment)
  }
}
