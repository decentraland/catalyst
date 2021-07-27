import { DeploymentContext } from '../../Service'
import { Validations } from '../Validations'
import { ValidationsForContext } from '../Validator'

export const VALIDATIONS_V2: ValidationsForContext = {
  [DeploymentContext.LOCAL]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.LOCAL_LEGACY_ENTITY]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.SYNCED]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.SYNCED_LEGACY_ENTITY]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.OVERWRITTEN]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.OVERWRITTEN_LEGACY_ENTITY]: [Validations.FAIL_ALWAYS],
  [DeploymentContext.FIX_ATTEMPT]: [Validations.FAIL_ALWAYS]
}
