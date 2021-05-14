import { DenylistRepository } from '../repository/extensions/DenylistRepository'
import { Denylist, DenylistMetadata, DenylistSignatureValidationResult } from './Denylist'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from './DenylistTarget'

export class DeactivatedDenylist extends Denylist {
  async addTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistSignatureValidationResult> {
    throw new Error('Add target from denylist is not activated.')
  }
  async removeTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistSignatureValidationResult> {
    throw new Error('Remove target from denylist is not activated.')
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
