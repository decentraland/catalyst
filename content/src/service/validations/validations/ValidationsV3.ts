import { DeploymentContext } from '../../Service'
import { Validations } from '../Validations'
import { ValidationsForContext } from '../Validator'

export const VALIDATIONS_V3: ValidationsForContext = {
  [DeploymentContext.LOCAL]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.REQUEST_SIZE_V3,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.NO_NEWER,
    Validations.RECENT,
    Validations.NO_REDEPLOYS,
    Validations.CONTENT
  ],
  [DeploymentContext.LOCAL_LEGACY_ENTITY]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ENTITY_STRUCTURE,
    Validations.NO_NEWER,
    Validations.RECENT,
    Validations.NO_REDEPLOYS,
    Validations.LEGACY_ENTITY,
    Validations.CONTENT,
    Validations.DECENTRALAND_ADDRESS
  ],
  [DeploymentContext.SYNCED]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT
  ],
  [DeploymentContext.SYNCED_LEGACY_ENTITY]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ENTITY_STRUCTURE,
    Validations.LEGACY_ENTITY,
    Validations.CONTENT,
    Validations.DECENTRALAND_ADDRESS
  ],
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
  [DeploymentContext.FIX_ATTEMPT]: [
    // TODO: Add limit so that v3 entities can only be deployed up to a certain date
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.MUST_HAVE_FAILED_BEFORE,
    Validations.CONTENT
  ]
}
