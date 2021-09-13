import { validateSignature } from '@catalyst/commons'
import { EthAddress } from 'dcl-crypto'
import { DenylistRepository } from '../repository/extensions/DenylistRepository'
import { Repository } from '../repository/Repository'
import { DB_REQUEST_PRIORITY } from '../repository/RepositoryQueue'
import { ContentAuthenticator } from '../service/auth/Authenticator'
import { ContentCluster } from '../service/synchronization/ContentCluster'
import {
  Denylist,
  DenylistAction,
  DenylistMetadata,
  DenylistOperationResult,
  DenylistOperationStatus,
  DenylistValidationType,
  isErrorOperation
} from './Denylist'
import { DenylistTarget, DenylistTargetId, DenylistTargetType } from './DenylistTarget'

export class ActiveDenylist extends Denylist {
  private empty: boolean = true
  constructor(
    private readonly repository: Repository,
    private readonly authenticator: ContentAuthenticator,
    private readonly cluster: ContentCluster,
    private readonly network: string
  ) {
    super()
  }

  async addTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistOperationResult> {
    // Validate blocker and signature
    const operationResult: DenylistOperationResult = await this.validateSignature(
      DenylistAction.ADDITION,
      target,
      metadata
    )
    if (isErrorOperation(operationResult)) {
      return operationResult
    }

    await this.repository.tx(
      async (transaction) => {
        // Add denylist
        await transaction.denylist.addTarget(target)

        // Add to history
        await transaction.denylist.addEventToHistory(target, metadata, DenylistAction.ADDITION)
      },
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
    this.empty = false
    return { status: DenylistOperationStatus.OK, type: DenylistValidationType.SIGNATURE_VALIDATION }
  }

  async removeTarget(target: DenylistTarget, metadata: DenylistMetadata): Promise<DenylistOperationResult> {
    // Validate blocker and signature
    const operationResult: DenylistOperationResult = await this.validateSignature(
      DenylistAction.REMOVAL,
      target,
      metadata
    )
    if (isErrorOperation(operationResult)) {
      return operationResult
    }

    await this.repository.tx(
      async (transaction) => {
        // Remove denylist
        await transaction.denylist.removeTarget(target)

        // Add to history
        await transaction.denylist.addEventToHistory(target, metadata, DenylistAction.REMOVAL)
      },
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
    this.empty =
      (
        await this.repository.run((db) => db.denylist.getAllDenylistedTargets(), {
          priority: DB_REQUEST_PRIORITY.HIGH
        })
      ).length === 0
    return { status: DenylistOperationStatus.OK, type: DenylistValidationType.SIGNATURE_VALIDATION }
  }

  async getAllDenylistedTargets(): Promise<{ target: DenylistTarget; metadata: DenylistMetadata }[]> {
    if (this.empty) {
      return []
    }
    return this.repository.run((db) => db.denylist.getAllDenylistedTargets(), {
      priority: DB_REQUEST_PRIORITY.LOW
    })
  }

  async isTargetDenylisted(target: DenylistTarget): Promise<boolean> {
    if (this.empty) {
      return false
    }
    const map = await this.repository.run((db) => this.areTargetsDenylisted(db.denylist, [target]), {
      priority: DB_REQUEST_PRIORITY.LOW
    })
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
    let denylisted = new Map()
    if (!this.empty) {
      denylisted = await denylistRepo.getDenylistedTargets(targets)
    }

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
  ): Promise<DenylistOperationResult> {
    const nodeOwner: EthAddress | undefined = this.cluster.getIdentityInDAO()?.owner
    const messageToSign = Denylist.internalBuildMessageToSign(action, target, metadata.timestamp)

    return new Promise((resolve) => {
      validateSignature(
        metadata,
        messageToSign,
        () =>
          resolve({
            status: DenylistOperationStatus.OK,
            type: DenylistValidationType.SIGNATURE_VALIDATION
          }),
        (errorMessage) =>
          resolve({
            status: DenylistOperationStatus.ERROR,
            type: DenylistValidationType.SIGNATURE_VALIDATION,
            message: `Failed to authenticate the blocker. Error was: ${errorMessage}`
          }),
        (signer) => !!signer && (nodeOwner === signer || this.authenticator.isAddressOwnedByDecentraland(signer)),
        this.network
      )
    })
  }
}
