export type Wearable = {
  id: string
  representations: {
    bodyShapes: string[]
    mainFile: string
    contents: {
      file: string
      hash: string
    }[]
  }[]
  type: string
  category: string
  tags: string[]
  baseUrl: string
  i18n: {
    code: string
    text: string
  }[]
  thumbnail: string
  image: string | undefined
  rarity?: RarityId
  description?: string
  issuedId?: number
}

export enum CollectionId {
  EXCLUSIVE_MASKS = 'exclusive_masks',
  BASE_AVATARS = 'base-avatars',
  HALLOWEEN_2019 = 'halloween_2019',
  XMAS_2019 = 'xmas_2019'
}

export type Collection = Wearable[]

export type FullCollection = {
  id: string
  wearables: Wearable[]
}
export type Collections = Record<CollectionId, Collection>

export type Token = {
  network: 'ethereum'
  contract: string
  id: string
}

export type Dar = {
  name: string
  common_name: CollectionId
  contract_uri: string
  schema_url: string
  image_url: string

  _conversion?: {
    kind: string
  }
}

export enum RarityId {
  SWANKY = 'swanky',
  EPIC = 'epic',
  LENGENDARY = 'legendary',
  MYTHIC = 'mythic',
  UNIQUE = 'unique'
}

export type Rarities = Record<RarityId, number>
