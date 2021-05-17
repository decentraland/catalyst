import { DenylistRepository } from '../repository/extensions/DenylistRepository'
import {
  Denylist,
  DenylistMetadata,
  DenylistOperationResult,
  DenylistOperationStatus,
  DenylistValidationType
} from './Denylist'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from './DenylistTarget'

export class DeactivatedDenylist extends Denylist {
  async addTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistOperationResult> {
    return {
      status: DenylistOperationStatus.ERROR,
      type: DenylistValidationType.CONFIGURATION,
      message: 'Denylist is not activated, so you can not add a target to the denylist.'
    }
  }
  async removeTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistOperationResult> {
    return {
      status: DenylistOperationStatus.ERROR,
      type: DenylistValidationType.CONFIGURATION,
      message: 'Denylist is not activated, so you can not remove a target from the denylist.'
    }
  }
  async getAllDenylistedTargets(): Promise<{ target: DenylistTarget; metadata: DenylistMetadata }[]> {
    return []
  }
  async isTargetDenylisted(target: DenylistTarget): Promise<boolean> {
    return false
  }
  async areTargetsDenylisted(
    denylistRepo: DenylistRepository,
    targets: DenylistTarget[]
  ): Promise<Map<DenylistTargetType, Map<string, boolean>>> {
    // Build result
    const result: Map<DenylistTargetType, Map<DenylistTargetId, boolean>> = new Map()
    targets.forEach((target) => {
      const type = target.getType()
      const id = target.getId()
      if (!result.has(type)) {
        result.set(type, new Map())
      }
      result.get(type)!.set(id, false)
    })

    return result
  }
}
