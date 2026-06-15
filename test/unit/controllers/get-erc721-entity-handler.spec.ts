import { getERC721EntityHandler } from '../../../src/controllers/handlers/get-erc721-entity-handler'
import { HandlerContextWithPath } from '../../../src/types'
import { NotFoundError } from '../../../src/controllers/errors'
import { createMockedActiveEntitiesComponent } from '../../mocks/active-entities-component-mock'
import { createMockedEntity } from '../../mocks/entity-mock'

describe('when retrieving an entity as ERC721 metadata', () => {
  let context: HandlerContextWithPath<
    'entities' | 'activeEntities' | 'database' | 'denylist',
    '/entities/active/erc721/:chainId/:contract/:option/:emission?'
  >
  let denylist: { isDenylisted: jest.Mock; reload: jest.Mock }
  let erc721Body: { id: string; name: string }

  beforeEach(() => {
    const entity = createMockedEntity({ id: 'erc721-entity', metadata: { rarity: 'legendary' } })
    erc721Body = { id: 'erc721-entity', name: 'a wearable' }
    denylist = { isDenylisted: jest.fn().mockReturnValue(false), reload: jest.fn() }

    context = {
      params: { chainId: '1', contract: '0xcontract', option: '0', emission: undefined },
      components: {
        database: {} as any,
        activeEntities: createMockedActiveEntitiesComponent({
          withPointers: jest.fn().mockResolvedValue([entity])
        }),
        entities: {
          buildUrn: jest.fn().mockReturnValue('urn:decentraland:ethereum:collections-v1:0xcontract:0'),
          formatERC721Entity: jest.fn().mockReturnValue(erc721Body)
        },
        denylist
      },
      url: new URL('http://localhost/entities/active/erc721/1/0xcontract/0'),
      request: {} as any
    } as unknown as HandlerContextWithPath<
      'entities' | 'activeEntities' | 'database' | 'denylist',
      '/entities/active/erc721/:chainId/:contract/:option/:emission?'
    >
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the entity is not denylisted', () => {
    it('should respond with the formatted ERC721 entity', async () => {
      const response = await getERC721EntityHandler(context)
      expect(response.body).toEqual(erc721Body)
    })
  })

  describe('and the entity is denylisted', () => {
    beforeEach(() => {
      denylist.isDenylisted.mockReturnValue(true)
    })

    it('should reject with a NotFoundError so the denylisted metadata is not served', async () => {
      await expect(getERC721EntityHandler(context)).rejects.toThrow(NotFoundError)
    })
  })
})
