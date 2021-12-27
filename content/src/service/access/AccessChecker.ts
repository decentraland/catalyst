import { Entity } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'

export interface AccessChecker {
  hasAccess(params: AccessParams): Promise<string[]>
}

export type AccessParams = Omit<Entity, 'id' | 'version'> & {
  ethAddress: EthAddress
}
