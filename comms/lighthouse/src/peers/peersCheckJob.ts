/**
 * Job that runs periodically to check that every registered peer is actually connected, and clearing those who are not
 */

import { LighthouseConfig } from '../config/configService'
import { AppServices } from '../types'

export async function peersCheckJob({
  peersService,
  configService
}: Pick<AppServices, 'peersService' | 'configService'>) {
  let jobTimeoutId: NodeJS.Timeout | number | undefined

  function clearNotConnectedPeers() {
    peersService().clearNotConnectedPeers()
  }

  return {
    start() {
      if (jobTimeoutId) return false // Shouldn't start twice

      const schedule = () => {
        jobTimeoutId = setTimeout(() => {
          console.info('Checking not connected peers')
          clearNotConnectedPeers()
          schedule()
        }, configService.get(LighthouseConfig.PEERS_CHECK_INTERVAL))
      }

      console.info('Starting check peers job')

      schedule()

      return true
    },
    stop() {
      if (!jobTimeoutId) return false
      clearTimeout(jobTimeoutId as any)
      return true
    }
  }
}
