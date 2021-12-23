import { stub } from 'sinon'
import { AppComponents } from 'src/types'
import { AccessChecker, AccessParams } from '../../../../src/service/access/AccessChecker'

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
  if (!returnErrors) {
    stub(components.accessChecker, 'hasAccess').resolves([])
  }
}
