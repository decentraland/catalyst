import { stub } from 'sinon'
import { AccessChecker, AccessParams } from '../../../../src/service/access/AccessChecker'
import { AppComponents } from '../../../../src/types'

export class MockedAccessChecker implements AccessChecker {
  private returnErrors: boolean = false

  hasAccess(params: AccessParams): Promise<string[]> {
    if (this.returnErrors) {
      return Promise.resolve(['Some errors'])
    } else {
      return Promise.resolve([])
    }
  }

  startReturningErrors() {
    this.returnErrors = true
  }

  stopReturningErrors() {
    this.returnErrors = false
  }
}

export function makeMockedAccessChecker(components: Pick<AppComponents, 'accessChecker'>, returnErrors?: boolean) {
  const response: string[] = []
  if (returnErrors) {
    response.push('anyError')
  }
  stub(components.accessChecker, 'hasAccess').resolves(response)
}
