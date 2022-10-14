export interface Clock {
  now(): number
}

export function createClock() {
  return {
    now: Date.now
  }
}
