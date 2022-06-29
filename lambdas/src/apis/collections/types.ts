import { EthAddress } from '@dcl/crypto'
import { Wearable, WearableRepresentation } from '@dcl/schemas'

export type Collection = {
  id: string
  name: string
}

export type WearableMetadata = Omit<Wearable, 'image'> & {
  image?: string
}

export type LambdasWearable = Omit<WearableMetadata, 'data'> & {
  data: Omit<Wearable['data'], 'representations'> & {
    representations: LambdasWearableRepresentation[]
  }
}
export type LambdasWearableRepresentation = Omit<WearableRepresentation, 'contents'> & {
  contents: { key: string; url: string }[]
}

export type WearableId = string // These ids are used as pointers on the content server
export type EmoteId = string // These ids are used as pointers on the content server

export type ItemFilters = {
  collectionIds?: string[]
  textSearch?: string
}

export type WearablesFilters = ItemFilters & {
  wearableIds?: string[]
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
