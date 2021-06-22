import { Island } from '@dcl/archipelago'
import { untilTrue } from '../../../commons/test-utils'
import { ConfigService, LighthouseConfig } from '../src/config/configService'
import { ArchipelagoService } from '../src/peers/archipelagoService'
import { PeersService } from '../src/peers/peersService'
import { AppServices } from '../src/types'

describe('Archipelago service', () => {
  function mockedArchipelagoParams(
    onIslandChanged: (peerChangingId: string, island: Island, fromIsland: Island | undefined) => any
  ): Pick<AppServices, 'configService' | 'peersService'> {
    return {
      configService: {
        listenTo<T>(_config: LighthouseConfig<T>, _listener: (newValue: T) => void): void {
          // Nothing to do
        },

        get<T>(config: LighthouseConfig<T>): T {
          if (config.name === LighthouseConfig.ARCHIPELAGO_FLUSH_FREQUENCY.name) return 0.05 as any
          return config.defaultValue
        }
      } as ConfigService,
      peersService: () =>
        ({
          notifyIslandChange(peerChangingId: string, island: Island, fromIsland: Island | undefined) {
            onIslandChanged(peerChangingId, island, fromIsland)
          }
        } as PeersService)
    }
  }

  it('should respond if two peers are on the same island', async () => {
    const processedPeerUpdates: string[] = []

    const service = new ArchipelagoService(
      mockedArchipelagoParams((peerChangingId) => processedPeerUpdates.push(peerChangingId))
    )

    service.updatePeerPosition('peer1', [0, 0, 0])
    service.updatePeerPosition('peer2', [0, 0, 0])
    service.updatePeerPosition('peer3', [1000, 1000, 1000])

    await untilTrue(
      () => processedPeerUpdates.length === 3,
      "All peers should have received island updates but they didn't. Received peer updates: " +
        processedPeerUpdates.join(', ')
    )

    expect(await service.areInSameIsland('peer1', 'peer2')).toBe(true)
    expect(await service.areInSameIsland('peer1', 'peer3')).toBe(false)
    expect(await service.areInSameIsland('peer2', 'peer3')).toBe(false)
    expect(await service.areInSameIsland('peer1', 'peer2', 'peer3')).toBe(false)
  })
})
