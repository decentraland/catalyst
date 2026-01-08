import { Emote, Entity, EntityType, Wearable, WearableCategory } from '@dcl/schemas'
import { translateEntityIntoEmote } from '../../../../../src/apis/collections/Utils'
import { SmartContentClient } from '../../../../../src/utils/SmartContentClient'

describe('emotes translation', () => {
  describe('when translating old emote into LambdasEmote', () => {
    let mockedClient: jest.Mocked<SmartContentClient>
    let contentServerUrl: string
    let femaleFilename: string
    let femaleHash: string
    let maleFilename: string
    let maleHash: string
    let emoteSavedAsWearable: any

    beforeEach(() => {
      contentServerUrl = 'content-server-url'
      mockedClient = {
        getExternalContentServerUrl: jest.fn().mockReturnValue(contentServerUrl)
      } as unknown as jest.Mocked<SmartContentClient>
      femaleFilename = 'female/emote.glb'
      femaleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45asdfasdfhrasdff'
      maleFilename = 'male/emote.glb'
      maleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45dzgjwcku2g6ayfu'
      emoteSavedAsWearable = {
        version: 'v3',
        id: 'i am an id',
        type: EntityType.WEARABLE,
        timestamp: 1234,
        content: [
          { file: 'image.png', hash: 'Qmbd1mvR7Wuo4VGEPfRkMGLDnhXwY3v4cZYdCQz2P4cZY1' },
          { file: 'thumbnail.png', hash: 'QmeuXyj1tu1biCbNuNTB2eyEfJ32g1oDRU2xWtgzSeFgqg' },
          { file: femaleFilename, hash: femaleHash },
          { file: maleFilename, hash: maleHash }
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
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should validate as a Wearable', () => {
      expect(Wearable.validate(emoteSavedAsWearable.metadata)).toBeTruthy()
    })

    it('should correctly map representations', () => {
      const lambdasEmote = translateEntityIntoEmote(mockedClient, emoteSavedAsWearable)
      const allContents: { key: string; url: string }[] = lambdasEmote.emoteDataADR74.representations.flatMap(
        (r: { contents: { key: string; url: string }[] }) => r.contents
      )
      expect(allContents.length).toBe(2)
      for (const content of allContents) {
        if (content.key == femaleFilename) {
          expect(content.url).toBe(`${contentServerUrl}/contents/${femaleHash}`)
        } else {
          expect(content.url).toBe(`${contentServerUrl}/contents/${maleHash}`)
        }
      }
    })

    it('should not have data property', () => {
      const lambdasEmote = translateEntityIntoEmote(mockedClient, emoteSavedAsWearable)
      expect('data' in lambdasEmote).toBeFalsy()
    })

    it('should not have emoteDataV0 property', () => {
      const lambdasEmote = translateEntityIntoEmote(mockedClient, emoteSavedAsWearable)
      expect('emoteDataV0' in lambdasEmote).toBeFalsy()
    })

    it('should be a valid Emote when representations are fixed', () => {
      const lambdasEmote = translateEntityIntoEmote(mockedClient, emoteSavedAsWearable)
      const validEmote: any = {
        ...lambdasEmote
      }
      validEmote.emoteDataADR74.representations = [
        {
          bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
          mainFile: 'male/emote.glb',
          contents: ['male/emote.glb']
        }
      ]
      expect(Emote.validate(validEmote)).toBeTruthy()
    })
  })

  describe('when translating new emote into LambdasEmote', () => {
    let mockedClient: jest.Mocked<SmartContentClient>
    let contentServerUrl: string
    let femaleFilename: string
    let femaleHash: string
    let maleFilename: string
    let maleHash: string
    let trueEmote: Entity

    beforeEach(() => {
      contentServerUrl = 'content-server-url'
      mockedClient = {
        getExternalContentServerUrl: jest.fn().mockReturnValue(contentServerUrl)
      } as unknown as jest.Mocked<SmartContentClient>
      femaleFilename = 'female/emote.glb'
      femaleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45asdfasdfhrasdff'
      maleFilename = 'male/emote.glb'
      maleHash = 'bafkreiaq2amoomlngobzh6l2e7stofkbzozwlyx2z45dzgjwcku2g6ayfu'
      trueEmote = {
        version: 'v3',
        id: 'bafkreibkbswiu6nhbkaj7wo3yfwnaf4k73sqzkajv3bb3kjquvqwpfyiz4',
        type: EntityType.EMOTE,
        timestamp: 1658763609095,
        pointers: ['urn:decentraland:mumbai:collections-v2:0x4c2cd3106d934e83db3b365baafb6623a8b80099:0'],
        content: [
          { file: 'thumbnail.png', hash: 'bafkreibhdozxxroantqhehz3z2wjwpbrchyjyyboutoecqn67ofl745jji' },
          { file: 'image.png', hash: 'bafkreiarq4yg3db2gaibjfzkq53s6ppgznx4e4qz4do3qvdhvn7qawbjry' },
          { file: femaleFilename, hash: femaleHash },
          { file: maleFilename, hash: maleHash }
        ],
        metadata: {
          id: 'urn:decentraland:mumbai:collections-v2:0x4c2cd3106d934e83db3b365baafb6623a8b80099:0',
          name: 'Emote',
          description: '',
          collectionAddress: '0x4c2cd3106d934e83db3b365baafb6623a8b80099',
          rarity: 'unique',
          i18n: [{ code: 'en', text: 'Emote' }],
          emoteDataADR74: {
            category: 'dance',
            representations: [
              {
                bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
                mainFile: 'male/emote.glb',
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
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should validate as an Emote', () => {
      expect(Emote.validate(trueEmote.metadata)).toBeTruthy()
    })

    it('should correctly map representation contents', () => {
      const lambdasEmote = translateEntityIntoEmote(mockedClient, trueEmote)
      const allContents: { key: string; url: string }[] = lambdasEmote.emoteDataADR74.representations.flatMap(
        (r: { contents: { key: string; url: string }[] }) => r.contents
      )
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
})
