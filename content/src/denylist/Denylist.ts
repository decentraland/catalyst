import { Timestamp } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import { DenylistRepository } from '../repository/extensions/DenylistRepository'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from './DenylistTarget'

export abstract class Denylist {
  constructor() {}

  static buildBlockMessageToSign(target: DenylistTarget, timestamp: Timestamp) {
    return this.internalBuildMessageToSign(DenylistAction.ADDITION, target, timestamp)
  }
  static buildUnblockMessageToSign(target: DenylistTarget, timestamp: Timestamp) {
    return this.internalBuildMessageToSign(DenylistAction.REMOVAL, target, timestamp)
  }

  static internalBuildMessageToSign(action: DenylistAction, target: DenylistTarget, timestamp: Timestamp) {
    const actionMessage = action == DenylistAction.ADDITION ? 'block' : 'unblock'
    return `${actionMessage}-${target.asString()}-${timestamp}`
  }

  abstract async addTarget(
    target: DenylistTarget,
    metadata: DenylistMetadata
  ): Promise<DenylistSignatureValidationResult>

  abstract async removeTarget(
    target: DenylistTarget,
    metadata: DenylistMetadata
  ): Promise<DenylistSignatureValidationResult>

  abstract getAllDenylistedTargets(): Promise<{ target: DenylistTarget; metadata: DenylistMetadata }[]>

  abstract async isTargetDenylisted(target: DenylistTarget): Promise<boolean>

  abstract async areTargetsDenylisted(
    denylistRepo: DenylistRepository,
    targets: DenylistTarget[]
  ): Promise<Map<DenylistTargetType, Map<DenylistTargetId, boolean>>>
}

export type DenylistMetadata = {
  timestamp: Timestamp
  authChain: AuthChain
}

export enum DenylistAction {
  ADDITION = 'addition',
  REMOVAL = 'removal'
}

export enum DenylistSignatureValidationStatus {
  OK,
  ERROR
}

export type DenylistSignatureValidationResult = {
  status: DenylistSignatureValidationStatus
  message?: string
}

export function isSuccessfulOperation(operation: DenylistSignatureValidationResult): boolean {
  return operation.status === DenylistSignatureValidationStatus.OK
}

export function isErrorOperation(operation: DenylistSignatureValidationResult): boolean {
  return !isSuccessfulOperation(operation)
}
