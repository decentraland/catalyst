import { DeploymentToValidate, ValidationResponse } from '@dcl/content-validator'
import { ServerValidator } from 'src/service/validations/server'
import { AppComponents } from '../../../../src/types'
import { State } from '../../../../src/ports/synchronizationState'

export class NoOpValidator {
  async validate(_d: DeploymentToValidate): Promise<ValidationResponse> {
    return { ok: true }
  }
}

export class NoOpServerValidator implements ServerValidator {
  async validate(): Promise<{ ok: true } | { ok: false; message: string }> {
    return { ok: true }
  }
}
export function makeNoopValidator(components: Pick<AppComponents, 'validator'>) {
  vi.spyOn(components.validator, 'validate').mockResolvedValue({ ok: true })
}

export function makeNoopDeploymentValidator(components: Pick<AppComponents, 'synchronizationState'>) {
  vi.spyOn(components.synchronizationState, 'getState').mockReturnValue(State.SYNCING)
}

export function makeNoopServerValidator(components: Pick<AppComponents, 'serverValidator'>) {
  vi.spyOn(components.serverValidator, 'validate').mockResolvedValue({ ok: true })
}
