import { Readable } from 'stream'

export function setupStreamTimeout(merged: Readable, timeout): void {
  let timer: NodeJS.Timer | undefined

  function reSchedule() {
    cancelCurrentTimer()
    timer = setTimeout(timedOut, timeout)
  }
  function timedOut() {
    // close stream
    merged.destroy(new Error('The stream has timed out'))
  }
  function cancelCurrentTimer() {
    if (timer) {
      clearTimeout(timer)
    }
    timer = undefined
  }

  reSchedule()
  merged.on('data', (_) => reSchedule())
  merged.on('end', cancelCurrentTimer)
  merged.on('error', cancelCurrentTimer)
}
