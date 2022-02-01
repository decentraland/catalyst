import { ISynchronizationManager } from '../../../../src/service/synchronization/SynchronizationManager'

export function makeNoopSynchronizationManager(component: ISynchronizationManager) {
  jest.spyOn(component, 'syncWithServers').mockResolvedValue()
}
