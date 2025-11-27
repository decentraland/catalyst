import { createMockedActiveEntitiesComponent } from '../../mocks/active-entities-component-mock'
import { getEntitiesByCollectionPointerPrefixHandler } from '../../../src/controller/handlers/filter-by-urn-handler'
import { HandlerContextWithPath, InvalidRequestError } from '../../../src/types'
import { ActiveEntities } from '../../../src/ports/activeEntities'
import { createMockedEntity } from '../../mocks/entity-mock'
import { Entity } from '@dcl/schemas'

describe('when retrieving active entities by a collection URN prefix', () => {
  let context: HandlerContextWithPath<'activeEntities', '/entities/active/collections/:collectionUrn'>
  let withPrefixMock: jest.MockedFn<ActiveEntities['withPrefix']>

  beforeEach(() => {
    withPrefixMock = jest.fn()

    context = {
      params: {
        collectionUrn: 'urn:decentraland:mumbai:collections-thirdparty:aThirdParty:winterCollection'
      },
      components: { activeEntities: createMockedActiveEntitiesComponent({ withPrefix: withPrefixMock }) },
      url: new URL(
        'http://localhost/entities/active/collections/urn:decentraland:mumbai:collections-thirdparty:aThirdParty:winterCollection'
      ),
      request: {} as any
    }
  })

  describe.each([
    {
      description: 'a third party collection',
      urn: 'urn:decentraland:mumbai:collections-thirdparty:aThirdParty:winterCollection',
      shouldBeValid: true
    },
    {
      description: 'a third party id',
      urn: 'urn:decentraland:mumbai:collections-thirdparty:aThirdParty',
      shouldBeValid: true
    },
    {
      description: 'a blockchain collection v1',
      urn: 'urn:decentraland:ethereum:collections-v1:0x06012c8cf97bead5deae237070f9587f8e7a266d',
      shouldBeValid: true
    },
    {
      description: 'a blockchain collection v2',
      urn: 'urn:decentraland:matic:collections-v2:0x1a8a8c6b6d6e9e7b1c0a1e8f8d4b2e3c7f9a8b6c',
      shouldBeValid: true
    },
    {
      description: 'an off-chain base-emotes collection',
      urn: 'urn:decentraland:off-chain:base-emotes:dance',
      shouldBeValid: true
    },
    {
      description: 'an off-chain base-avatars collection',
      urn: 'urn:decentraland:off-chain:base-avatars:BaseFemale',
      shouldBeValid: true
    },
    {
      description: 'an off-chain collection with invalid registry',
      urn: 'urn:decentraland:off-chain:some-other-registry:item',
      shouldBeValid: false
    },
    {
      description: 'a LAND parcel URN',
      urn: 'urn:decentraland:ethereum:LAND:0,0',
      shouldBeValid: false
    },
    {
      description: 'an estate URN',
      urn: 'urn:decentraland:ethereum:ESTATE:123',
      shouldBeValid: false
    }
  ])('and the URN prefix is of $description', ({ urn, shouldBeValid }) => {
    beforeEach(() => {
      context.params.collectionUrn = urn
      withPrefixMock.mockResolvedValue({ total: 1, entities: [createMockedEntity()] })
    })

    if (shouldBeValid) {
      it('should call the withPrefix method with the URN prefix', async () => {
        await getEntitiesByCollectionPointerPrefixHandler(context)
        expect(withPrefixMock).toHaveBeenCalledWith(urn, 0, 100)
      })
    } else {
      it('should throw an InvalidRequestError', async () => {
        await expect(getEntitiesByCollectionPointerPrefixHandler(context)).rejects.toThrow(InvalidRequestError)
        await expect(getEntitiesByCollectionPointerPrefixHandler(context)).rejects.toThrow(
          `Invalid collection urn param, it must be a valid urn prefix of a collection or a third party id, instead: '${urn}'`
        )
      })
    }
  })

  describe('and the URN format is invalid', () => {
    beforeEach(() => {
      context.params.collectionUrn = 'not-a-valid-urn'
    })

    it('should throw an InvalidRequestError with the correct error message', async () => {
      await expect(getEntitiesByCollectionPointerPrefixHandler(context)).rejects.toThrow(InvalidRequestError)
      await expect(getEntitiesByCollectionPointerPrefixHandler(context)).rejects.toThrow(
        `Invalid URN format: ${context.params.collectionUrn}`
      )
    })
  })

  describe('and there are no entities that match the URN prefix', () => {
    beforeEach(() => {
      withPrefixMock.mockResolvedValue({ total: 0, entities: [] })
    })

    it('should return an empty list', async () => {
      const response = await getEntitiesByCollectionPointerPrefixHandler(context)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ total: 0, entities: [] })
    })
  })

  describe('and there are entities that match the URN prefix', () => {
    let entities: Entity[]

    beforeEach(() => {
      entities = [createMockedEntity()]
      withPrefixMock.mockResolvedValue({ total: entities.length, entities })
    })

    it('should return the active entities that match the URN prefix', async () => {
      const response = await getEntitiesByCollectionPointerPrefixHandler(context)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ total: entities.length, entities })
    })
  })
})
