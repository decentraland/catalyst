import { EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'

export interface AccessChecker {
  hasAccess(
    entityType: EntityType,
    pointers: Pointer[],
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<string[]>
}
