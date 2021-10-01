import { DeploymentContext } from '../../Service'
import { Validations } from '../Validations'
import { ValidationsForContext } from '../Validator'

export const VALIDATIONS_V3: ValidationsForContext = {
  // This is the context used when deploying an entity to the Catalyst directly
  [DeploymentContext.LOCAL]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.REQUEST_SIZE_V3,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.NO_NEWER,
    Validations.RECENT,
    Validations.NO_REDEPLOYS,
    Validations.CONTENT_V3,
    Validations.RATE_LIMIT
  ],
  [DeploymentContext.LOCAL_LEGACY_ENTITY]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ENTITY_STRUCTURE,
    Validations.NO_NEWER,
    Validations.RECENT,
    Validations.NO_REDEPLOYS,
    Validations.LEGACY_ENTITY,
    Validations.CONTENT_V3,
    Validations.DECENTRALAND_ADDRESS
  ],
  // This is a context during synchronization: when the deployment is already deployed.
  // That's why here it's not present NO_REDEPLOY, during sync you can receive the same deployment from different catalysts.
  [DeploymentContext.SYNCED]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT_V3
  ],
  [DeploymentContext.SYNCED_LEGACY_ENTITY]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ENTITY_STRUCTURE,
    Validations.LEGACY_ENTITY,
    Validations.CONTENT_V3,
    Validations.DECENTRALAND_ADDRESS
  ],
  // This is during synchronization when a deployment needs to  be done, but you already have a newer which overwrites it.
  // So, at this moment the files from the entity of the overwritten deployment are not download.
  [DeploymentContext.OVERWRITTEN]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE
  ],
  [DeploymentContext.OVERWRITTEN_LEGACY_ENTITY]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ENTITY_STRUCTURE,
    Validations.LEGACY_ENTITY,
    Validations.DECENTRALAND_ADDRESS
  ],
  // This context is used only when running the fix deployments script
  [DeploymentContext.FIX_ATTEMPT]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.MUST_HAVE_FAILED_BEFORE,
    Validations.CONTENT_V3,
    Validations.RATE_LIMIT
  ]
}
