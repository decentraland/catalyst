import { stub } from 'sinon'
import { SynchronizationManager } from '../../../../src/service/synchronization/SynchronizationManager'

export class MockedSynchronizationManager implements SynchronizationManager {
  start(): Promise<void> {
    return Promise.resolve()
  }

  stop(): Promise<void> {
    return Promise.resolve()
  }

  getStatus(): any {
    return {}
  }
}

export function makeNoopSynchronizationManager(component: SynchronizationManager) {
  stub(component, 'start').resolves()
  stub(component, 'stop').resolves()
}
