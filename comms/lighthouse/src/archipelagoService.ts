import { ArchipelagoController, ArchipelagoControllerOptions, defaultArchipelagoController } from '@dcl/archipelago'
import { isPosition3D, Position } from 'decentraland-katalyst-utils/Positions'

export class ArchipelagoService {
  private readonly controller: ArchipelagoController

  constructor(options: ArchipelagoControllerOptions) {
    this.controller = defaultArchipelagoController(options)
  }

  updatePeerPosition(peerId: string, position?: Position) {
    if (position && isPosition3D(position)) {
      this.controller.setPeersPositions({ id: peerId, position })
    }
  }
}
