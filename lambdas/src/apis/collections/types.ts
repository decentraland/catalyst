import { EthAddress } from '@dcl/crypto'
import {
  Emote,
  EmoteDataADR74,
  EmoteDataADR287,
  EmoteRepresentationADR74,
  Wearable,
  WearableId,
  WearableRepresentation
} from '@dcl/schemas'

export type Collection = {
  id: string
  name: string
}

export type LambdasWearable = Omit<Wearable, 'data'> & {
  data: Omit<Wearable['data'], 'representations'> & {
    representations: LambdasWearableRepresentation[]
  }
}
export type LambdasWearableRepresentation = Omit<WearableRepresentation, 'contents'> & {
  contents: { key: string; url: string }[]
}

type BaseLambdasEmote<T> = Omit<Emote, keyof T> & {
  [K in keyof T]: Omit<T[K], 'representations'> & {
    representations: LambdasEmoteRepresentation[]
  }
}

export type LambdasEmote =
  | BaseLambdasEmote<{ emoteDataADR74: EmoteDataADR74 }>
  | BaseLambdasEmote<{ emoteDataADR287: EmoteDataADR287 }>

export type LambdasEmoteRepresentation = Omit<EmoteRepresentationADR74, 'contents'> & {
  contents: { key: string; url: string }[]
}

export type EmoteId = string // These ids are used as pointers on the content server

export type ItemFilters = {
  collectionIds?: string[]
  textSearch?: string
  itemIds?: string[]
}

export type ItemPagination = {
  limit: number
  lastId: WearableId | EmoteId | undefined
}

export type ERC721StandardTrait = {
  trait_type: string
  value: string
}

export type ThirdPartyIntegration = {
  urn: string
  name: string
  description: string
}

export type ThirdPartyAsset = {
  id: string
  amount: number
  urn: {
    decentraland: string
  }
}

export type ThirdPartyAPIResponse = {
  address: EthAddress
  total: number
  page: number
  assets: ThirdPartyAsset[]
  next?: string
}
