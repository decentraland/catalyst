import { ArchipelagoController, defaultArchipelagoController, Island, IslandUpdates } from '@dcl/archipelago'
import { isPosition3D, Position } from 'decentraland-catalyst-utils/Positions'
import { LighthouseConfig } from '../config/configService'
import { AppServices } from '../types'
import { PeerOutgoingMessageType } from 'comms-protocol/messageTypes'
import { PeersService } from './peersService'

export class ArchipelagoService {
  private readonly controller: ArchipelagoController
  private readonly peersServiceGetter: () => PeersService

  constructor({ configService, peersService }: Pick<AppServices, 'configService' | 'peersService'>) {
    this.controller = defaultArchipelagoController({
      archipelagoParameters: {
        joinDistance: configService.get(LighthouseConfig.ARCHIPELAGO_JOIN_DISTANCE),
        leaveDistance: configService.get(LighthouseConfig.ARCHIPELAGO_LEAVE_DISTANCE)
      }
    })

    configService.listenTo(LighthouseConfig.ARCHIPELAGO_JOIN_DISTANCE, (joinDistance) =>
      this.controller.modifyOptions({ joinDistance })
    )
    configService.listenTo(LighthouseConfig.ARCHIPELAGO_LEAVE_DISTANCE, (leaveDistance) =>
      this.controller.modifyOptions({ leaveDistance })
    )

    this.controller.subscribeToUpdates(this.onIslandUpdates.bind(this))

    this.peersServiceGetter = peersService
  }

  updatePeerPosition(peerId: string, position?: Position) {
    if (position && isPosition3D(position)) {
      this.controller.setPeersPositions({ id: peerId, position })
    }
  }

  get peersService() {
    return this.peersServiceGetter()
  }

  clearPeer(id: string) {
    this.controller.clearPeers(id)
  }

  async onIslandUpdates(updates: IslandUpdates) {
    const cachedIslands: Record<string, Island> = {}

    const getIsland = async (id: string) => {
      if (id in cachedIslands) return cachedIslands[id]

      const island = await this.controller.getIsland(id)

      if (island) {
        cachedIslands[id] = island
        return island
      }
    }

    for (const id in updates) {
      const update = updates[id]

      const island = await getIsland(updates[id].islandId)
      // This could be undefined for a short lived island, in the round trip between the worker & this service.
      if (island) {
        switch (update.action) {
          case 'changeTo': {
            const fromIsland: Island | undefined = update.fromIslandId
              ? await getIsland(update.fromIslandId)
              : undefined

            this.peersService.notifyIslandChange(id, island, fromIsland)
            break
          }
          case 'leave': {
            this.peersService.sendUpdateToIsland(id, island, PeerOutgoingMessageType.PEER_LEFT_ISLAND)
            break
          }
        }
      }
    }
  }
}
