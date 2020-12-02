import { EthAddress } from 'dcl-crypto'
import { EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'

export interface AccessChecker {
  hasAccess(
    entityType: EntityType,
    pointers: Pointer[],
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<string[]>
}
