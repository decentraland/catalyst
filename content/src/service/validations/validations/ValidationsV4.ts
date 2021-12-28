import { DeploymentContext } from '../../Service'
import { Validations } from '../Validations'
import { ValidationsForContext } from '../Validator'

export const VALIDATIONS_V4: ValidationsForContext = {
  [DeploymentContext.LOCAL]: [
    Validations.IPFS_HASHING,
    Validations.METADATA_SCHEMA,
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT_V4,
    Validations.REQUEST_SIZE_V4,
    Validations.WEARABLE_FILES,
    Validations.NO_NEWER,
    Validations.RECENT,
    Validations.NO_REDEPLOYS
  ],
  [DeploymentContext.SYNCED]: [
    Validations.IPFS_HASHING,
    Validations.METADATA_SCHEMA,
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT_V4,
    Validations.REQUEST_SIZE_V4,
    Validations.WEARABLE_FILES
  ],
  [DeploymentContext.FIX_ATTEMPT]: [
    Validations.MUST_HAVE_FAILED_BEFORE,
    Validations.IPFS_HASHING,
    Validations.METADATA_SCHEMA,
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT_V4,
    Validations.REQUEST_SIZE_V4,
    Validations.WEARABLE_FILES
  ],
  // Note: there is no need for legacy entities anymore, so we won't allow then in v4
  [DeploymentContext.SYNCED_LEGACY_ENTITY]: [Validations.FAIL_ALWAYS]
}
