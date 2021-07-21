import { DeploymentContext } from '../../Service'
import { Validations } from '../Validations'
import { ValidationsForContext } from '../Validator'

export const VALIDATIONS_V3: ValidationsForContext = {
  [DeploymentContext.LOCAL]: [
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
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT
  ],
  [DeploymentContext.SYNCED_LEGACY_ENTITY]: [
    Validations.SIGNATURE,
    Validations.ENTITY_STRUCTURE,
    Validations.LEGACY_ENTITY,
    Validations.CONTENT,
    Validations.DECENTRALAND_ADDRESS
  ],
  [DeploymentContext.OVERWRITTEN]: [Validations.SIGNATURE, Validations.ACCESS, Validations.ENTITY_STRUCTURE],
  [DeploymentContext.OVERWRITTEN_LEGACY_ENTITY]: [
    Validations.SIGNATURE,
    Validations.ENTITY_STRUCTURE,
    Validations.LEGACY_ENTITY,
    Validations.DECENTRALAND_ADDRESS
  ],
  [DeploymentContext.FIX_ATTEMPT]: [
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.MUST_HAVE_FAILED_BEFORE,
    Validations.CONTENT
  ]
}
