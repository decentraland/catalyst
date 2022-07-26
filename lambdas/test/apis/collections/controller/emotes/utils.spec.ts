import { Emote, Entity, EntityType, Wearable, WearableCategory } from '@dcl/schemas'
import { instance, mock, when } from 'ts-mockito'
import { translateEntityIntoEmote } from '../../../../../src/controllers/handlers/collections/utils/Utils'
import { SmartContentClient } from '../../../../../src/utils/SmartContentClient'

describe('emotes translation', () => {

  it('translate old emote into LambdasEmote', async () => {
    const mockedClient: SmartContentClient = mock<SmartContentClient>()
    const contentServerUrl = 'content-server-url'
    when(mockedClient.getExternalContentServerUrl()).thenReturn(contentServerUrl)
    const femaleFilename = 'female/emote.glb'
    const femaleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45asdfasdfhrasdff'
    const maleFilename = 'male/emote.glb'
    const maleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45dzgjwcku2g6ayfu'
    const emoteSavedAsWearable = {
      version: 'v3',
      id: 'i am an id',
      type: EntityType.WEARABLE,
      timestamp: 1234,
      content: [
        { file: 'image.png', hash: 'Qmbd1mvR7Wuo4VGEPfRkMGLDnhXwY3v4cZYdCQz2P4cZY1' },
        { file: 'thumbnail.png', hash: 'QmeuXyj1tu1biCbNuNTB2eyEfJ32g1oDRU2xWtgzSeFgqg' },
        { file: femaleFilename, hash: femaleHash },
        { file: maleFilename, hash: maleHash },
      ],
      pointers: [],
      metadata: {
        id: 'urn:decentraland:mumbai:collections-v2:0x93e1c9479569d397fd3751fe5169da58e9cae4ae:1',
        name: 'Fashionista',
        description: '',
        collectionAddress: '0x93e1c9479569d397fd3751fe5169da58e9cae4ae',
        rarity: 'rare',
        i18n: [{ code: 'en', text: 'Fashionista' }],
        data: {
          tags: [],
          // Old Emotes were saved as 'simple' category but currently that is not allowed
          category: WearableCategory.EYES,
          representations: [
            {
              bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
              mainFile: maleFilename,
              contents: [maleFilename],
              overrideHides: [],
              overrideReplaces: []
            },
            {
              bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseFemale'],
              mainFile: femaleFilename,
              contents: [femaleFilename],
              overrideHides: [],
              overrideReplaces: []
            }
          ],
          hides: [],
          replaces: []

        },
        image: 'image.png',
        thumbnail: 'thumbnail.png',
        metrics: {
          triangles: 0,
          materials: 0,
          textures: 0,
          meshes: 0,
          bodies: 0,
          entities: 1
        },
        emoteDataV0: {
          loop: true
        }
      }
    }
    expect(Wearable.validate(emoteSavedAsWearable.metadata)).toBeTruthy()
    const lambdasEmote = translateEntityIntoEmote(instance(mockedClient), emoteSavedAsWearable)
    // We validate that the representations are correctly mapped
    const allContents: { key: string, url: string }[] = lambdasEmote.emoteDataADR74.representations
      .flatMap((r: { contents: { key: string, url: string }[] }) => r.contents)
    expect(allContents.length).toBe(2)
    for (const content of allContents) {
      if (content.key == femaleFilename) {
        expect(content.url).toBe(`${contentServerUrl}/contents/${femaleHash}`)
      } else {
        expect(content.url).toBe(`${contentServerUrl}/contents/${maleHash}`)
      }
    }
    expect('data' in lambdasEmote).toBeFalsy()
    expect('emoteDataV0' in lambdasEmote).toBeFalsy()
    // Now we validate that, expect the representations, it is an actual Emote
    const validEmote: any = {
      ...lambdasEmote
    }
    validEmote.emoteDataADR74.representations = [
      {
        bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
        mainFile: "male/emote.glb",
        contents: ['male/emote.glb']
      }
    ]
    expect(Emote.validate(validEmote)).toBeTruthy()
  })

  it('translate new emote into LambasEmote', async () => {
    const mockedClient: SmartContentClient = mock<SmartContentClient>()
    const contentServerUrl = 'content-server-url'
    when(mockedClient.getExternalContentServerUrl()).thenReturn(contentServerUrl)
    const femaleFilename = 'female/emote.glb'
    const femaleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45asdfasdfhrasdff'
    const maleFilename = 'male/emote.glb'
    const maleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45dzgjwcku2g6ayfu'
    const trueEmote: Entity = {
      version: 'v3',
      id: 'bafkreibkbswiu6nhbkaj7wo3yfwnaf4k73sqzkajv3bb3kjquvqwpfyiz4',
      type: EntityType.EMOTE,
      timestamp: 1658763609095,
      pointers: ['urn:decentraland:mumbai:collections-v2:0x4c2cd3106d934e83db3b365baafb6623a8b80099:0'],
      content: [
        { file: 'thumbnail.png', hash: 'bafkreibhdozxxroantqhehz3z2wjwpbrchyjyyboutoecqn67ofl745jji' },
        { file: 'image.png', hash: 'bafkreiarq4yg3db2gaibjfzkq53s6ppgznx4e4qz4do3qvdhvn7qawbjry' },
        { file: femaleFilename, hash: femaleHash },
        { file: maleFilename, hash: maleHash },
      ],
      metadata: {
        id: 'urn:decentraland:mumbai:collections-v2:0x4c2cd3106d934e83db3b365baafb6623a8b80099:0',
        name: 'Emote',
        description: '',
        collectionAddress: '0x4c2cd3106d934e83db3b365baafb6623a8b80099',
        rarity: 'unique',
        i18n: [{ code: 'en', text: 'Emote' }],
        emoteDataADR74: {
          category: 'simple',
          representations: [
            {
              bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
              mainFile: "male/emote.glb",
              contents: ['male/emote.glb']
            },
            {
              bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseFemale'],
              mainFile: 'female/emote.glb',
              contents: ['female/emote.glb']
            }
          ],
          tags: [],
          loop: false
        },
        image: 'image.png',
        thumbnail: 'thumbnail.png',
        metrics: {
          triangles: 0,
          materials: 0,
          textures: 0,
          meshes: 0,
          bodies: 0,
          entities: 1
        }
      }
    }
    expect(Emote.validate(trueEmote.metadata)).toBeTruthy()
    const lambdasEmote = translateEntityIntoEmote(instance(mockedClient), trueEmote)
    const allContents: { key: string, url: string }[] = lambdasEmote.emoteDataADR74.representations
      .flatMap((r: { contents: { key: string, url: string }[] }) => r.contents)
    expect(allContents.length).toBe(2)
    for (const content of allContents) {
      if (content.key == femaleFilename) {
        expect(content.url).toBe(`${contentServerUrl}/contents/${femaleHash}`)
      } else {
        expect(content.url).toBe(`${contentServerUrl}/contents/${maleHash}`)
      }
    }
  })
})
