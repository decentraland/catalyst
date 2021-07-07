import { AccessChecker, AccessParams } from '@katalyst/content/service/access/AccessChecker'

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
