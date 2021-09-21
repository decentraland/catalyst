import log4js from 'log4js'
import { Readable } from 'stream'

export function setupStreamTimeout(merged: Readable, timeout): void {
  const logger = log4js.getLogger('StreamTimeoutHandler')

  let timer: NodeJS.Timer | undefined

  function reSchedule() {
    cancelCurrentTimer()
    timer = setTimeout(timedOut, timeout)
  }
  function timedOut() {
    logger.warn('The merged stream has timed out')
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
