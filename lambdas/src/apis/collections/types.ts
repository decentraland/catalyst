import { EthAddress } from '@dcl/crypto'
import { Emote, EmoteRepresentationADR74, Wearable, WearableRepresentation } from '@dcl/schemas'

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

export type LambdasEmote = Omit<Emote, 'emoteDataADR74'> & {
  emoteDataADR74: Omit<Emote['emoteDataADR74'], 'representations'> & {
    representations: LambdasEmoteRepresentation[]
  }
}

export type LambdasEmoteRepresentation = Omit<EmoteRepresentationADR74, 'contents'> & {
  contents: { key: string; url: string }[]
}

// TODO-ALE: replace with import { WearableId } from '@dcl/schemas'
export type WearableId = string // These ids are used as pointers on the content server
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
