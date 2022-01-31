import { ClusterSynchronizationManager } from '../../../../src/service/synchronization/SynchronizationManager'

export function makeNoopSynchronizationManager(component: ClusterSynchronizationManager) {
  jest.spyOn(component, 'syncWithServers').mockResolvedValue()
}
