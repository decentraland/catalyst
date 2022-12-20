import { AppComponents } from '../types'

export enum State {
  BOOTSTRAPPING = 'Bootstrapping',
  SYNCING = 'Syncing'
}
export interface SynchronizationState {
  getState: () => State
  toSyncing: () => void
}

export function createSynchronizationState(components: Pick<AppComponents, 'logs'>): SynchronizationState {
  let state = State.BOOTSTRAPPING
  return {
    getState() {
      return state
    },
    toSyncing() {
      components.logs.getLogger('synchronization-state').info('Switching to syncing state...')
      state = State.SYNCING
    }
  }
}
