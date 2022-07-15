import { Entity, EntityType } from '@dcl/schemas'
import { instance, mock, when } from 'ts-mockito'
import { WearableMetadata } from '../../../src/apis/collections/types'
import { translateEntityIntoWearable } from '../../../src/apis/collections/Utils'
import { SmartContentClient } from '../../../src/utils/SmartContentClient'

const EXTERNAL_URL = 'https://external.com'
const [CONTENT_KEY1, CONTENT_KEY2, CONTENT_KEY3] = ['key1', 'key2', 'key3']
const [CONTENT_HASH1, CONTENT_HASH2, CONTENT_HASH3] = ['hash1', 'hash2', 'hash3']

describe('Collection Utils', () => {
  it(`When wearable metadata is translated, then url is added to file references`, async () => {
    const client = getClient()
    const entity = buildEntity()

    const wearable = translateEntityIntoWearable(client, entity)
    const entityMetadata: WearableMetadata = entity.metadata

    // Compare top level properties
    assertAreEqualExceptProperties(wearable, entityMetadata, 'thumbnail', 'image', 'data')
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

  function assertAreEqualExceptProperties<Union, T extends Union, K extends Union>(
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

function buildMetadata(): WearableMetadata {
  return {
    id: 'id',
    description: 'description',
    thumbnail: CONTENT_KEY1,
    image: CONTENT_KEY2,
    rarity: 'rarity',
    i18n: [],
    createdAt: 10,
    updatedAt: 20,
    data: {
      replaces: [],
      hides: [],
      tags: [],
      category: 'category',
      representations: [
        {
          bodyShapes: ['some-shape'],
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
