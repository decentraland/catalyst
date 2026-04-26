import { Clock } from './types'

export function createClock(): Clock {
  return {
    now: Date.now
  }
}
