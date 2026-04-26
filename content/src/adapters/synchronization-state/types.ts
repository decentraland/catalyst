export enum State {
  BOOTSTRAPPING = 'Bootstrapping',
  SYNCING = 'Syncing'
}

export interface SynchronizationState {
  getState: () => State
  toSyncing: () => void
}
