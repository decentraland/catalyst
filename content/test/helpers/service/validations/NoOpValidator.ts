import { DeploymentToValidate, ValidationResponse } from '@dcl/content-validator'
import { ServerValidator } from 'src/service/validations/server'
import { AppComponents } from '../../../../src/types'

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
  jest.spyOn(components.validator, 'validate').mockResolvedValue({ ok: true })
}

export function makeNoopServerValidator(components: Pick<AppComponents, 'serverValidator'>) {
  jest.spyOn(components.serverValidator, 'validate').mockResolvedValue({ ok: true })
}
