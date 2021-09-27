import { DeploymentContext } from '../../Service'
import { Validations } from '../Validations'
import { ValidationsForContext } from '../Validator'

export const VALIDATIONS_V4: ValidationsForContext = {
  [DeploymentContext.LOCAL]: [
    Validations.IPFS_HASHING,
    // TODO: Validations.REQUEST_SIZE_V4
    Validations.METADATA_SCHEMA,
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT,
    Validations.NO_NEWER,
    Validations.RECENT,
    Validations.NO_REDEPLOYS,
    Validations.RATE_LIMIT
  ],
  [DeploymentContext.SYNCED]: [
    Validations.IPFS_HASHING,
    // TODO: Validations.REQUEST_SIZE_V4
    Validations.METADATA_SCHEMA,
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT,
    Validations.RATE_LIMIT
  ],
  // This is during synchronization when a deployment needs to  be done, but you already have a newer which overwrites it.
  // So, at this moment the files from the entity of the overwritten deployment are not download.
  [DeploymentContext.OVERWRITTEN]: [
    Validations.IPFS_HASHING,
    // TODO: Validations.REQUEST_SIZE_V4
    Validations.METADATA_SCHEMA,
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.RATE_LIMIT
  ],
  [DeploymentContext.FIX_ATTEMPT]: [
    Validations.IPFS_HASHING,
    // TODO: Validations.REQUEST_SIZE_V4
    Validations.METADATA_SCHEMA,
    Validations.SIGNATURE,
    Validations.ACCESS,
    Validations.ENTITY_STRUCTURE,
    Validations.CONTENT,
    Validations.MUST_HAVE_FAILED_BEFORE,
    Validations.RATE_LIMIT
  ],
  // Note: there is no need for legacy entities anymore, so we won't allow then in v4
  [DeploymentContext.SYNCED_LEGACY_ENTITY]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.LOCAL_LEGACY_ENTITY]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.OVERWRITTEN_LEGACY_ENTITY]: [Validations.FAIL_ALWAYS]
}
