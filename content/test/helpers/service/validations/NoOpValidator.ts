import { DeploymentContext } from '@katalyst/content/service/Service'
import { DeploymentToValidate, ExternalCalls, Validator } from '@katalyst/content/service/validations/Validator'

export class NoOpValidator implements Validator {
  async validate(
    deployment: DeploymentToValidate,
    context: DeploymentContext,
    calls: ExternalCalls
  ): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    return { ok: true }
  }
}
