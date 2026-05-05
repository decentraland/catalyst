import { ContractAddress } from '@dcl/schemas'

export enum ContractType {
  ERC721 = 'erc721',
  ERC1155 = 'erc1155',
  UNKNOWN = 'unknown'
}

export type ThirdPartyContractRegistry = {
  isErc721(contractAddress: ContractAddress): boolean
  isErc1155(contractAddress: ContractAddress): boolean
  isUnknown(contractAddress: ContractAddress): boolean
  ensureContractsKnown(contractAddresses: ContractAddress[]): Promise<void>
}
