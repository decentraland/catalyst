import { AppComponents } from '../types'

export enum State {
  BOOTSTRAPPING = 'Bootstrapping',
  SYNCING = 'Syncing'
}
export interface SynchronizationState {
  getState: () => State
  toSyncing: () => void
}

export function createSynchronizationState(components: Pick<AppComponents, 'logs' | 'metrics'>): SynchronizationState {
  let state = State.BOOTSTRAPPING
  components.metrics.observe('dcl_content_server_sync_state', {}, 0)
  return {
    getState() {
      return state
    },
    toSyncing() {
      components.logs.getLogger('synchronization-state').info('Switching to syncing state...')
      state = State.SYNCING
      components.metrics.observe('dcl_content_server_sync_state', {}, 1)
    }
  }
}
