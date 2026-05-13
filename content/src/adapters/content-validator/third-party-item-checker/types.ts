export type { ThirdPartyItemChecker } from '@dcl/content-validator'

/** Internal classification of a third-party contract; persisted in the per-network cache file. */
export enum ContractType {
  ERC721 = 'erc721',
  ERC1155 = 'erc1155',
  UNKNOWN = 'unknown'
}
