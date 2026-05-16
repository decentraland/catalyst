import { DeploymentToValidate, ValidationResponse } from '@dcl/content-validator'
import * as deploymentServiceServerValidator from '../../../../src/logic/deployment-service/server-validator'
import { State } from '../../../../src/logic/sync-orchestrator'
import { AppComponents } from '../../../../src/types'

export class NoOpValidator {
  async validate(_d: DeploymentToValidate): Promise<ValidationResponse> {
    return { ok: true }
  }
}

export function makeNoopValidator(components: Pick<AppComponents, 'validator'>) {
  jest.spyOn(components.validator, 'validate').mockResolvedValue({ ok: true })
}

export function makeNoopDeploymentValidator(components: Pick<AppComponents, 'syncOrchestrator'>) {
  jest.spyOn(components.syncOrchestrator, 'getState').mockReturnValue(State.SYNCING)
}

/**
 * Bypass the deploy-service's server-side validations (newer-entities, rate limits, TTL,
 * already-deployed, fix-attempt rules). Spies on the module-level `validateForServer`
 * function — after the server-validator fold there is no `components.serverValidator`
 * to spy on.
 */
export function makeNoopServerValidator() {
  jest.spyOn(deploymentServiceServerValidator, 'validateForServer').mockResolvedValue({ ok: true })
}
