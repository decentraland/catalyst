import { Entity } from '@dcl/schemas'

export type Erc721Entity = {
  id: string
  name: string | undefined
  description: string
  language: string
  image: string | undefined
  thumbnail: string | undefined
  attributes: { trait_type: string; value: string }[]
}

export interface IErc721 {
  /**
   * Build a Decentraland wearable/emote URN for the given protocol, contract address, and item option.
   * Uses `collections-v2` for `0x`-prefixed contracts and `collections-v1` otherwise.
   */
  buildUrn(protocol: string, contract: string, option: string): string

  /**
   * Build the ERC-721 metadata payload for the given entity, suitable for return from the
   * `/entities/active/erc721/...` endpoint. `emission` is the rarity-numbered emission suffix
   * (e.g. `42` → "DCL Wearable 42/100000").
   */
  formatERC721Entity(urn: string, entity: Entity, emission: string | undefined): Erc721Entity
}
