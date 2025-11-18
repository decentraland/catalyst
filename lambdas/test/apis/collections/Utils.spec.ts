import { BodyShape, Entity, EntityType, Rarity, Wearable, WearableCategory, Emote, EmoteCategory } from '@dcl/schemas'
import { instance, mock, when } from 'ts-mockito'
import { translateEntityIntoWearable, translateEntityIntoEmote } from '../../../src/apis/collections/Utils'
import { SmartContentClient } from '../../../src/utils/SmartContentClient'

const EXTERNAL_URL = 'https://external.com'
const [CONTENT_KEY1, CONTENT_KEY2, CONTENT_KEY3] = ['key1', 'key2', 'key3']
const [CONTENT_HASH1, CONTENT_HASH2, CONTENT_HASH3] = ['hash1', 'hash2', 'hash3']

describe('Collection Utils', () => {
  it(`When wearable metadata is translated, then url is added to file references`, async () => {
    const client = getClient()
    const entity = buildEntity()

    let wearable = translateEntityIntoWearable(client, entity)
    const entityMetadata: Wearable = entity.metadata

    // Compare top level properties
    expect(wearable).toBeDefined()
    assertAreEqualExceptProperties(wearable!, entityMetadata, 'thumbnail', 'image', 'data')
    wearable = wearable!
    expect(wearable.thumbnail).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH1}`)
    expect(wearable.image).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH2}`)

    // Compare data
    assertAreEqualExceptProperties(wearable.data, entityMetadata.data, 'representations')

    // Compare representations
    expect(wearable.data.representations.length).toEqual(1)
    const [translatedRepresentation] = wearable.data.representations
    const [originalRepresentation] = entityMetadata.data.representations
    assertAreEqualExceptProperties(translatedRepresentation, originalRepresentation, 'contents')

    // Compare contents
    expect(translatedRepresentation.contents.length).toEqual(1)
    const [translatedContent] = translatedRepresentation.contents
    const [originalContent] = originalRepresentation.contents
    expect(translatedContent.key).toEqual(originalContent)
    expect(translatedContent.url).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH3}`)
  })

  describe('when emote metadata is translated', () => {
    describe('and emote metadata is ADR74', () => {
      let client: SmartContentClient
      let entity: Entity
      let emote: any
      let entityMetadata: Emote

      beforeEach(() => {
        client = getClient()
        entity = buildADR74EmoteEntity()
        emote = translateEntityIntoEmote(client, entity)
        entityMetadata = entity.metadata
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should add url to thumbnail', () => {
        expect(emote.thumbnail).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH1}`)
      })

      it('should add url to image', () => {
        expect(emote.image).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH2}`)
      })

      it('should have emoteDataADR74 property', () => {
        expect('emoteDataADR74' in emote).toBe(true)
      })

      it('should not have emoteDataADR287 property', () => {
        expect('emoteDataADR287' in emote).toBe(false)
      })

      it('should preserve emoteDataADR74 properties except representations', () => {
        expect(emote.emoteDataADR74).toBeDefined()
        assertAreEqualExceptProperties(emote.emoteDataADR74, entityMetadata.emoteDataADR74, 'representations')
      })

      it('should have one representation in emoteDataADR74', () => {
        expect(emote.emoteDataADR74.representations.length).toEqual(1)
      })

      it('should preserve representation properties except contents', () => {
        const [translatedRepresentation] = emote.emoteDataADR74.representations
        const [originalRepresentation] = entityMetadata.emoteDataADR74.representations
        assertAreEqualExceptProperties(translatedRepresentation, originalRepresentation, 'contents')
      })

      it('should have one content in representation', () => {
        const [translatedRepresentation] = emote.emoteDataADR74.representations
        expect(translatedRepresentation.contents.length).toEqual(1)
      })

      it('should add url to content and preserve key', () => {
        const [translatedRepresentation] = emote.emoteDataADR74.representations
        const [originalRepresentation] = entityMetadata.emoteDataADR74.representations
        const [translatedContent] = translatedRepresentation.contents
        const [originalContent] = originalRepresentation.contents
        expect(translatedContent.key).toEqual(originalContent)
        expect(translatedContent.url).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH3}`)
      })
    })

    describe('and emote is saved as wearable metadata', () => {
      let client: SmartContentClient
      let entity: Entity
      let emote: any
      let entityMetadata: Wearable

      beforeEach(() => {
        client = getClient()
        entity = buildEmoteAsWearableEntity()
        emote = translateEntityIntoEmote(client, entity)
        entityMetadata = entity.metadata
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should be defined', () => {
        expect(emote).toBeDefined()
      })

      it('should add url to thumbnail', () => {
        expect(emote.thumbnail).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH1}`)
      })

      it('should add url to image', () => {
        expect(emote.image).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH2}`)
      })

      it('should have emoteDataADR74 property', () => {
        expect('emoteDataADR74' in emote).toBe(true)
      })

      it('should have defined emoteDataADR74', () => {
        expect(emote.emoteDataADR74).toBeDefined()
      })

      it('should set default category to DANCE', () => {
        expect(emote.emoteDataADR74.category).toEqual(EmoteCategory.DANCE)
      })

      it('should preserve tags from original metadata', () => {
        expect(emote.emoteDataADR74.tags).toEqual(entityMetadata.data.tags)
      })

      it('should set loop to false', () => {
        expect(emote.emoteDataADR74.loop).toEqual(false)
      })

      it('should have one representation in emoteDataADR74', () => {
        expect(emote.emoteDataADR74.representations.length).toEqual(1)
      })

      it('should preserve representation properties except contents', () => {
        const [translatedRepresentation] = emote.emoteDataADR74.representations
        const [originalRepresentation] = entityMetadata.data.representations
        assertAreEqualExceptProperties(translatedRepresentation, originalRepresentation, 'contents')
      })

      it('should have one content in representation', () => {
        const [translatedRepresentation] = emote.emoteDataADR74.representations
        expect(translatedRepresentation.contents.length).toEqual(1)
      })

      it('should add url to content and preserve key', () => {
        const [translatedRepresentation] = emote.emoteDataADR74.representations
        const [originalRepresentation] = entityMetadata.data.representations
        const [translatedContent] = translatedRepresentation.contents
        const [originalContent] = originalRepresentation.contents
        expect(translatedContent.key).toEqual(originalContent)
        expect(translatedContent.url).toEqual(`${EXTERNAL_URL}/contents/${CONTENT_HASH3}`)
      })
    })
  })

  function assertAreEqualExceptProperties<Union extends object, T extends Union, K extends Union>(
    actual: T,
    expected: K,
    ...propertiesToIgnore: (keyof (T & K))[]
  ) {
    expect(Object.keys(actual)).toEqual(Object.keys(expected))
    for (const key of Object.keys(actual)) {
      if (!propertiesToIgnore.includes(key as keyof (T & K))) {
        expect(actual[key]).toEqual(expected[key])
      }
    }
  }
})

function buildEntity(): Entity {
  return {
    version: 'v3',
    id: '',
    type: EntityType.WEARABLE,
    pointers: [],
    timestamp: 1,
    content: [
      {
        file: CONTENT_KEY1,
        hash: CONTENT_HASH1
      },
      {
        file: CONTENT_KEY2,
        hash: CONTENT_HASH2
      },
      {
        file: CONTENT_KEY3,
        hash: CONTENT_HASH3
      }
    ],
    metadata: buildMetadata()
  }
}

function buildMetadata(): Wearable {
  return {
    id: 'id',
    name: 'my wearable',
    description: 'description',
    thumbnail: CONTENT_KEY1,
    image: CONTENT_KEY2,
    rarity: Rarity.UNCOMMON,
    collectionAddress: 'address',
    i18n: [],
    data: {
      replaces: [],
      hides: [],
      tags: [],
      category: WearableCategory.EYES,
      representations: [
        {
          bodyShapes: [BodyShape.MALE],
          mainFile: CONTENT_KEY3,
          contents: [CONTENT_KEY3],
          overrideHides: [],
          overrideReplaces: []
        }
      ]
    }
  }
}

function buildADR74EmoteEntity(): Entity {
  return {
    version: 'v3',
    id: '',
    type: EntityType.EMOTE,
    pointers: [],
    timestamp: 1,
    content: [
      {
        file: CONTENT_KEY1,
        hash: CONTENT_HASH1
      },
      {
        file: CONTENT_KEY2,
        hash: CONTENT_HASH2
      },
      {
        file: CONTENT_KEY3,
        hash: CONTENT_HASH3
      }
    ],
    metadata: buildADR74EmoteMetadata()
  }
}

function buildADR74EmoteMetadata(): Emote {
  return {
    id: 'emote-id',
    name: 'my emote',
    description: 'emote description',
    thumbnail: CONTENT_KEY1,
    image: CONTENT_KEY2,
    rarity: Rarity.UNCOMMON,
    collectionAddress: 'address',
    i18n: [],
    emoteDataADR74: {
      category: EmoteCategory.DANCE,
      tags: ['dance', 'fun'],
      loop: false,
      representations: [
        {
          bodyShapes: [BodyShape.MALE, BodyShape.FEMALE],
          mainFile: CONTENT_KEY3,
          contents: [CONTENT_KEY3]
        }
      ]
    }
  }
}

function buildEmoteAsWearableEntity(): Entity {
  return {
    version: 'v3',
    id: '',
    type: EntityType.EMOTE,
    pointers: [],
    timestamp: 1,
    content: [
      {
        file: CONTENT_KEY1,
        hash: CONTENT_HASH1
      },
      {
        file: CONTENT_KEY2,
        hash: CONTENT_HASH2
      },
      {
        file: CONTENT_KEY3,
        hash: CONTENT_HASH3
      }
    ],
    metadata: buildEmoteAsWearableMetadata()
  }
}

function buildEmoteAsWearableMetadata(): Wearable {
  return {
    id: 'emote-id',
    name: 'my emote',
    description: 'emote description',
    thumbnail: CONTENT_KEY1,
    image: CONTENT_KEY2,
    rarity: Rarity.UNCOMMON,
    collectionAddress: 'address',
    i18n: [],
    data: {
      replaces: [],
      hides: [],
      tags: ['dance', 'fun'],
      category: WearableCategory.EYES,
      representations: [
        {
          bodyShapes: [BodyShape.MALE, BodyShape.FEMALE],
          mainFile: CONTENT_KEY3,
          contents: [CONTENT_KEY3],
          overrideHides: [],
          overrideReplaces: []
        }
      ]
    }
  }
}

function getClient(): SmartContentClient {
  const mockedClient = mock(SmartContentClient)
  when(mockedClient.getExternalContentServerUrl()).thenReturn(EXTERNAL_URL)
  return instance(mockedClient)
}
