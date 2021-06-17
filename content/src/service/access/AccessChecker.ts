import { EntityId, EntityType, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'

export interface AccessChecker {
  hasAccess(params: AccessParams): Promise<string[]>
}

export type AccessParams = {
  entityType: EntityType
  entityId: EntityId
  pointers: Pointer[]
  timestamp: Timestamp
  ethAddress: EthAddress
}
