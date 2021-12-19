import { stub } from 'sinon'
import { Validator } from '../../../../src/service/validations/Validator'
import { AppComponents } from '../../../../src/types'

export class NoOpValidator implements Validator {
  async validate(): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    return { ok: true }
  }
}

export function makeNoopValidator(components: Pick<AppComponents, 'validator'>) {
  stub(components.validator, 'validate').resolves({ ok: true })
}
