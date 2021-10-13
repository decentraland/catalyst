import {
  ArchipelagoController,
  defaultArchipelagoController,
  Island,
  IslandUpdates,
  PeerPositionChange
} from '@dcl/archipelago'
import { ConfigService, LighthouseConfig } from '../config/configService'
import { metricsComponent } from '../metrics'
import { AppServices } from '../types'
import { PeersService } from './peersService'
import { PeerOutgoingMessageType } from './protocol/messageTypes'

export class ArchipelagoService {
  private readonly controller: ArchipelagoController
  private readonly peersServiceGetter: () => PeersService
  private readonly configService: ConfigService

  constructor({ configService, peersService }: Pick<AppServices, 'configService' | 'peersService'>) {
    this.controller = defaultArchipelagoController({
      flushFrequency: configService.get(LighthouseConfig.ARCHIPELAGO_FLUSH_FREQUENCY),
      archipelagoParameters: {
        joinDistance: configService.get(LighthouseConfig.ARCHIPELAGO_JOIN_DISTANCE),
        leaveDistance: configService.get(LighthouseConfig.ARCHIPELAGO_LEAVE_DISTANCE),
        maxPeersPerIsland: configService.get(LighthouseConfig.MAX_PEERS_PER_ISLAND)
      }
    })

    configService.listenTo(LighthouseConfig.ARCHIPELAGO_JOIN_DISTANCE, (joinDistance) =>
      this.controller.modifyOptions({ joinDistance })
    )
    configService.listenTo(LighthouseConfig.ARCHIPELAGO_LEAVE_DISTANCE, (leaveDistance) =>
      this.controller.modifyOptions({ leaveDistance })
    )

    this.configService = configService

    this.controller.subscribeToUpdates(this.onIslandUpdates.bind(this))

    this.peersServiceGetter = peersService
  }

  updatePeerPosition(peerId: string, positionUpdate: Omit<PeerPositionChange, 'id'>) {
    this.controller.setPeersPositions({ ...positionUpdate, id: peerId })
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

    try {
      metricsComponent.observe('dcl_lighthouse_islands_count', {}, await this.getIslandsCount())
    } catch {
      // mordor
    }
  }

  async areInSameIsland(peerId: string, ...otherPeerIds: string[]) {
    const peersData = await this.controller.getPeersData([peerId, ...otherPeerIds])
    const expectedIslandId = peersData[peerId]?.islandId
    return !!expectedIslandId && Object.values(peersData).every((data) => data.islandId === expectedIslandId)
  }

  async getIslands(): Promise<{ ok: false; message: string } | { ok: true; islands: Island[] }> {
    const peersCount = this.peersService.getActivePeersCount()

    if (peersCount >= this.configService.get(LighthouseConfig.HIGH_LOAD_PEERS_COUNT))
      return { ok: false, message: 'Cannot query islands during high load' }

    return { ok: true, islands: await this.controller.getIslands() }
  }

  async getIsland(islandId: string): Promise<Island | undefined> {
    return this.controller.getIsland(islandId)
  }

  async getIslandsCount(): Promise<number> {
    return this.controller.getIslandsCount()
  }
}
