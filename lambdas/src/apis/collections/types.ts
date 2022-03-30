import { EthAddress } from 'dcl-crypto'

export type Collection = {
  id: string
  name: string
}

export type WearableMetadata = {
  id: WearableId
  description: string
  thumbnail: string
  image?: string
  collectionAddress?: EthAddress
  rarity: Rarity
  i18n: I18N[]
  data: WearableMetadataData
  metrics?: Metrics
  createdAt: number
  updatedAt: number
}

export type WearableMetadataRepresentation = {
  bodyShapes: WearableBodyShape[]
  mainFile: string
  contents: string[]
  overrideHides: WearableCategory[]
  overrideReplaces: WearableCategory[]
}

type WearableMetadataData = {
  replaces: WearableCategory[]
  hides: WearableCategory[]
  tags: string[]
  representations: WearableMetadataRepresentation[]
  category: WearableCategory
}
export type WearableBodyShape = WearableId
type WearableCategory = string
type Rarity = string
export type I18N = {
  code: LanguageCode
  text: string
}
type Metrics = {
  triangles: number
  materials: number
  textures: number
  meshes: number
  bodies: number
  entities: number
}

type LanguageCode = string

export type Wearable = Omit<WearableMetadata, 'data'> & { data: WearableData }
type WearableData = Omit<WearableMetadataData, 'representations'> & { representations: WearableRepresentation[] }
export type WearableRepresentation = Omit<WearableMetadataRepresentation, 'contents'> & {
  contents: { key: string; url: string }[]
}

export type WearableId = string // These ids are used as pointers on the content server

export type WearablesFilters = {
  collectionIds?: string[]
  wearableIds?: string[]
  textSearch?: string
}

export type WearablesPagination = {
  limit: number
  lastId: WearableId | undefined
}

export type ERC721StandardTrait = {
  trait_type: string
  value: string
}

export type ThirdPartyIntegration = {
  urn: string
  description: string
}
