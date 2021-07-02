import { EthAddress } from 'dcl-crypto'
import { Entity } from '../Entity'

export interface AccessChecker {
  hasAccess(params: AccessParams): Promise<string[]>
}

export type AccessParams = Entity & {
  ethAddress: EthAddress
}
