import { Validator } from '@dcl/content-validator'
import { stub } from 'sinon'
import { AppComponents } from '../../../../src/types'

export class NoOpValidator implements Validator {
  async validate(): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    return { ok: true }
  }
}

export class NoOpServerValidator implements Validator {
  async validate(): Promise<{ ok: true } | { ok: false; message: string }> {
    return { ok: true }
  }
}
export function makeNoopValidator(components: Pick<AppComponents, 'validator' | 'serverValidator'>) {
  stub(components.validator, 'validate').resolves({ ok: true })
  stub(components.serverValidator, 'validate').resolves({ ok: true })
}
