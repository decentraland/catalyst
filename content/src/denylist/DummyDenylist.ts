import { DenylistRepository } from '../repository/extensions/DenylistRepository'
import {
  Denylist,
  DenylistMetadata,
  DenylistSignatureValidationResult,
  DenylistSignatureValidationStatus
} from './Denylist'
import { DenylistTarget, DenylistTargetType } from './DenylistTarget'

export class DummyDenylist extends Denylist {
  async addTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistSignatureValidationResult> {
    return { status: DenylistSignatureValidationStatus.OK }
  }
  async removeTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistSignatureValidationResult> {
    return { status: DenylistSignatureValidationStatus.OK }
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
    return new Map()
  }
}
