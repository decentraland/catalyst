import { Island } from '@dcl/archipelago'
import { PeerOutgoingMessageType } from 'comms-protocol/messageTypes'
import { untilTrue } from '../../../commons/test-utils'
import { ConfigService, LighthouseConfig } from '../src/config/configService'
import { ArchipelagoService } from '../src/peers/archipelagoService'
import { PeersService } from '../src/peers/peersService'
import { AppServices } from '../src/types'

describe('Archipelago service', () => {
  function mockedArchipelagoParams(
    onIslandChanged: (peerChangingId: string, island: Island, fromIsland: Island | undefined) => any = () => {},
    onUpdateSentToIsland: (
      peerId: string,
      island: Island,
      type: PeerOutgoingMessageType.PEER_JOINED_ISLAND | PeerOutgoingMessageType.PEER_LEFT_ISLAND
    ) => any = () => {}
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
          sendUpdateToIsland(
            peerId: string,
            island: Island,
            type: PeerOutgoingMessageType.PEER_JOINED_ISLAND | PeerOutgoingMessageType.PEER_LEFT_ISLAND
          ) {
            onUpdateSentToIsland(peerId, island, type)
          },
          notifyIslandChange(peerChangingId: string, island: Island, fromIsland: Island | undefined) {
            onIslandChanged(peerChangingId, island, fromIsland)
          }
        } as PeersService)
    }
  }

  function setPeersPositions(service: ArchipelagoService, ...positions: [string, number, number, number][]) {
    for (const [id, ...pos] of positions) {
      service.updatePeerPosition(id, pos)
    }
  }

  it('should respond if two peers are on the same island', async () => {
    const processedPeerUpdates: string[] = []

    const service = new ArchipelagoService(
      mockedArchipelagoParams((peerChangingId) => processedPeerUpdates.push(peerChangingId))
    )

    setPeersPositions(service, ['peer1', 0, 0, 0], ['peer2', 0, 0, 0], ['peer3', 1000, 1000, 1000])

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

  it('should notify island of updates', async () => {
    const notifiedIslandChanges: { peerId: string; island: Island; fromIsland: Island | undefined }[] = []
    const updatesSentDirectly: { peerId: string; island: Island; type: PeerOutgoingMessageType }[] = []

    function findForPeer<T extends { peerId: string }>(id: string, items: T[]): T {
      return items.find((it) => it.peerId === id)!
    }

    const service = new ArchipelagoService(
      mockedArchipelagoParams(
        (peerId, island, fromIsland) => notifiedIslandChanges.push({ peerId, island, fromIsland }),
        (peerId, island, type) => updatesSentDirectly.push({ peerId, island, type })
      )
    )

    setPeersPositions(service, ['peer1', 0, 0, 0], ['peer2', 0, 0, 0], ['peer3', 1000, 1000, 1000])

    await untilTrue(
      () => notifiedIslandChanges.length === 3,
      "Should have received islands updates but didn't. Updates received: " + JSON.stringify(notifiedIslandChanges)
    )

    expect(notifiedIslandChanges.length).toEqual(3)
    const peer1Island = findForPeer('peer1', notifiedIslandChanges).island.id
    expect(peer1Island).toEqual(findForPeer('peer2', notifiedIslandChanges).island.id)
    expect(peer1Island).not.toEqual(findForPeer('peer3', notifiedIslandChanges).island.id)

    notifiedIslandChanges.length = 0
    setPeersPositions(service, ['peer3', 10, 0, 10])

    await untilTrue(
      () => notifiedIslandChanges.length === 1,
      "Should have received an island update for peer3 but didn't. Received updates: " +
        JSON.stringify(notifiedIslandChanges)
    )

    expect(findForPeer('peer3', notifiedIslandChanges).island.id).toEqual(peer1Island)

    service.clearPeer('peer2')

    await untilTrue(
      () => updatesSentDirectly.length === 1,
      "Should have received a direct update but didn't. Updates received: " + JSON.stringify(updatesSentDirectly)
    )

    const update = findForPeer('peer2', updatesSentDirectly)

    expect(update.type).toEqual(PeerOutgoingMessageType.PEER_LEFT_ISLAND)
    expect(update.island.id).toEqual(peer1Island)
  })
})
