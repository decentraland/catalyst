import { Timestamp } from 'dcl-catalyst-commons'
import { AuthChain, EthAddress } from 'dcl-crypto'
import { validateSignature } from 'decentraland-katalyst-commons/signatures'
import { ContentAuthenticator } from '../service/auth/Authenticator'
import { ContentCluster } from '../service/synchronization/ContentCluster'
import { DenylistRepository } from '../storage/repositories/DenylistRepository'
import { Repository } from '../storage/Repository'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from './DenylistTarget'

export class Denylist {
  constructor(
    private readonly repository: Repository,
    private readonly authenticator: ContentAuthenticator,
    private readonly cluster: ContentCluster,
    private readonly network: string
  ) {}

  static buildBlockMessageToSign(target: DenylistTarget, timestamp: Timestamp) {
    return this.internalBuildMessageToSign(DenylistAction.ADDITION, target, timestamp)
  }
  static buildUnblockMessageToSign(target: DenylistTarget, timestamp: Timestamp) {
    return this.internalBuildMessageToSign(DenylistAction.REMOVAL, target, timestamp)
  }
  private static internalBuildMessageToSign(action: DenylistAction, target: DenylistTarget, timestamp: Timestamp) {
    const actionMessage = action == DenylistAction.ADDITION ? 'block' : 'unblock'
    return `${actionMessage}-${target.asString()}-${timestamp}`
  }

  async addTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistSignatureValidationResult> {
    // Validate blocker and signature
    const operationResult: DenylistSignatureValidationResult = await this.validateSignature(
      DenylistAction.ADDITION,
      target,
      metadata
    )
    if (isErrorOperation(operationResult)) {
      return operationResult
    }

    await this.repository.tx(async (transaction) => {
      // Add denylist
      await transaction.denylist.addTarget(target)

      // Add to history
      await transaction.denylist.addEventToHistory(target, metadata, DenylistAction.ADDITION)
    })
    return { status: DenylistSignatureValidationStatus.OK }
  }

  async removeTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistSignatureValidationResult> {
    // Validate blocker and signature
    const operationResult: DenylistSignatureValidationResult = await this.validateSignature(
      DenylistAction.REMOVAL,
      target,
      metadata
    )
    if (isErrorOperation(operationResult)) {
      return operationResult
    }

    await this.repository.tx(async (transaction) => {
      // Remove denylist
      await transaction.denylist.removeTarget(target)

      // Add to history
      await transaction.denylist.addEventToHistory(target, metadata, DenylistAction.REMOVAL)
    })
    return { status: DenylistSignatureValidationStatus.OK }
  }

  getAllDenylistedTargets(): Promise<{ target: DenylistTarget; metadata: DenylistMetadata }[]> {
    return this.repository.run((db) => db.denylist.getAllDenylistedTargets())
  }

  async isTargetDenylisted(target: DenylistTarget): Promise<boolean> {
    const map = await this.repository.run((db) => this.areTargetsDenylisted(db.denylist, [target]))
    return map.get(target.getType())?.get(target.getId()) ?? false
  }

  async areTargetsDenylisted(
    denylistRepo: DenylistRepository,
    targets: DenylistTarget[]
  ): Promise<Map<DenylistTargetType, Map<DenylistTargetId, boolean>>> {
    if (targets.length === 0) {
      return new Map()
    }

    // Get only denylisted
    const denylisted = await denylistRepo.getDenylistedTargets(targets)

    // Build result
    const result: Map<DenylistTargetType, Map<DenylistTargetId, boolean>> = new Map()
    targets.forEach((target) => {
      const type = target.getType()
      const id = target.getId()
      const isDenylisted = denylisted.get(type)?.includes(id) ?? false
      if (!result.has(type)) {
        result.set(type, new Map())
      }
      result.get(type)!.set(id, isDenylisted)
    })

    return result
  }

  private async validateSignature(
    action: DenylistAction,
    target: DenylistTarget,
    metadata: DenylistMetadata
  ): Promise<DenylistSignatureValidationResult> {
    const nodeOwner: EthAddress | undefined = this.cluster.getIdentityInDAO()?.owner
    const messageToSign = Denylist.internalBuildMessageToSign(action, target, metadata.timestamp)

    return new Promise((resolve) => {
      validateSignature(
        metadata,
        messageToSign,
        () =>
          resolve({
            status: DenylistSignatureValidationStatus.OK
          }),
        (errorMessage) =>
          resolve({
            status: DenylistSignatureValidationStatus.ERROR,
            message: `Failed to authenticate the blocker. Error was: ${errorMessage}`
          }),
        (signer) => !!signer && (nodeOwner === signer || this.authenticator.isAddressOwnedByDecentraland(signer)),
        this.network
      )
    })
  }
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
