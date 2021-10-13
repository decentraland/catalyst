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

  abstract addTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistOperationResult>

  abstract removeTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistOperationResult>

  abstract getAllDenylistedTargets(): Promise<{ target: DenylistTarget; metadata: DenylistMetadata }[]>

  abstract isTargetDenylisted(target: DenylistTarget): Promise<boolean>

  abstract areTargetsDenylisted(
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

export enum DenylistValidationType {
  SIGNATURE_VALIDATION,
  CONFIGURATION
}

export enum DenylistOperationStatus {
  OK,
  ERROR
}

export type DenylistOperationResult = {
  type: DenylistValidationType
  status: DenylistOperationStatus
  message?: string
}

export function isSuccessfulOperation(operation: DenylistOperationResult): boolean {
  return operation.status === DenylistOperationStatus.OK
}

export function isErrorOperation(operation: DenylistOperationResult): boolean {
  return !isSuccessfulOperation(operation)
}
