import { ArchipelagoController, defaultArchipelagoController } from '@dcl/archipelago'
import { isPosition3D, Position } from 'decentraland-catalyst-utils/Positions'
import { ConfigService, LighthouseConfig } from '../config/configService'

export class ArchipelagoService {
  private readonly controller: ArchipelagoController

  constructor({ configService }: { configService: ConfigService }) {
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
  }

  updatePeerPosition(peerId: string, position?: Position) {
    if (position && isPosition3D(position)) {
      this.controller.setPeersPositions({ id: peerId, position })
    }
  }

  clearPeer(id: string) {
    this.controller.clearPeers(id)
  }
}
