import { anything, instance, mock, verify, when } from 'ts-mockito'
import { findThirdPartyItemUrns } from '../../src/logic/third-party-urn-finder'
import { ThirdPartyAssetFetcher } from '../../src/ports/third-party/third-party-fetcher'
import { TheGraphClient } from '../../src/utils/TheGraphClient'

const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const TPW_WEARABLE_ID = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party:someWearable'

describe('findItemUrns', () => {
  it('when resolver and assets exists for the owner, it returns the correct urn', async () => {
    const expectedRegistryId = 'some-third-party'
    const expectedOwner = SOME_ADDRESS
    const tpFetcher: ThirdPartyAssetFetcher = {
      fetchAssets: (url, registryId, owner) => {
        const assets = registryId === expectedRegistryId && owner === expectedOwner
          ? [{
            id: TPW_WEARABLE_ID,
            amount: 1,
            urn: { decentraland: TPW_WEARABLE_ID }
          }]
          : []
        return Promise.resolve(assets)
      }
    }

    const mockedGraphClient = mock(TheGraphClient)
    when(mockedGraphClient.findThirdPartyResolver(anything(), anything())).thenResolve('some-url')

    const wearableUrns = await findThirdPartyItemUrns(instance(mockedGraphClient),
      tpFetcher, SOME_ADDRESS, 'urn:decentraland:mumbai:collections-thirdparty:some-third-party')

    expect(wearableUrns.length).toEqual(1)
    expect(wearableUrns[0]).toEqual(TPW_WEARABLE_ID)
    verify(mockedGraphClient.findThirdPartyResolver('thirdPartyRegistrySubgraph', 'some-third-party'))
  })

  it('when the resolver does not exist, it rejects with error', async () => {
    const expectedRegistryId = 'some-third-party'
    const collectionId = 'urn:decentraland:mumbai:collections-thirdparty:' + expectedRegistryId
    const expectedOwner = SOME_ADDRESS
    const tpFetcher: ThirdPartyAssetFetcher = {
      fetchAssets: (url, registryId, owner) => {
        const assets = registryId === expectedRegistryId && owner === expectedOwner
          ? [{
            id: TPW_WEARABLE_ID,
            amount: 1,
            urn: { decentraland: TPW_WEARABLE_ID }
          }]
          : []
        return Promise.resolve(assets)
      }
    }

    const mockedGraphClient = mock(TheGraphClient)
    when(mockedGraphClient.findThirdPartyResolver(anything(), anything())).thenResolve(undefined)

    await expect(findThirdPartyItemUrns(instance(mockedGraphClient),
      tpFetcher, SOME_ADDRESS, collectionId))
      .rejects.toThrow(`Could not find third party resolver for collectionId: ${collectionId}`)
  })

  it('when the fetcher returns assets from another thirdparty, then they get filtered', async () => {
    const tpFetcher: ThirdPartyAssetFetcher = {
      fetchAssets: () => {
        return Promise.resolve([
          {
            id: TPW_WEARABLE_ID,
            amount: 1,
            urn: { decentraland: TPW_WEARABLE_ID }
          },
          {
            id: TPW_WEARABLE_ID,
            amount: 1,
            urn: { decentraland: 'wrongUrn!' }
          }
        ])
      }
    }

    const mockedGraphClient = mock(TheGraphClient)
    when(mockedGraphClient.findThirdPartyResolver(anything(), anything())).thenResolve('some-url')

    const wearableUrns = await findThirdPartyItemUrns(instance(mockedGraphClient),
      tpFetcher, SOME_ADDRESS, 'urn:decentraland:mumbai:collections-thirdparty:some-third-party')

    expect(wearableUrns.length).toEqual(1)
    expect(wearableUrns[0]).toEqual(TPW_WEARABLE_ID)
    verify(mockedGraphClient.findThirdPartyResolver('thirdPartyRegistrySubgraph', 'some-third-party'))
  })
})
