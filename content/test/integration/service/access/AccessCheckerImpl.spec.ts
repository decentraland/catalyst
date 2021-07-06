import {
  DEFAULT_COLLECTIONS_SUBGRAPH_ROPSTEN,
  DEFAULT_LAND_MANAGER_SUBGRAPH_ROPSTEN
} from '@katalyst/content/Environment'
import { AccessCheckerImpl, AccessCheckerImplParams } from '@katalyst/content/service/access/AccessCheckerImpl'
import { ContentAuthenticator } from '@katalyst/content/service/auth/Authenticator'
import { EntityType, Fetcher } from 'dcl-catalyst-commons'

describe('Integration - AccessCheckerImpl', function () {
  it(`When access URL is wrong while checking scene access it reports an error`, async () => {
    const accessChecker = buildAccessCheckerImpl({ landManagerSubgraphUrl: 'Wrong URL' })

    const errors = await accessChecker.hasAccess({
      type: EntityType.SCENE,
      pointers: ['102,4'],
      timestamp: Date.now(),
      ethAddress: 'Some-address-without-permissions'
    })

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual('The provided Eth Address does not have access to the following parcel: (102,4)')
  })

  it(`When an address without permissions tries to deploy a scene it fails`, async () => {
    const accessChecker = buildAccessCheckerImpl({ landManagerSubgraphUrl: DEFAULT_LAND_MANAGER_SUBGRAPH_ROPSTEN })

    const errors = await accessChecker.hasAccess({
      type: EntityType.SCENE,
      pointers: ['102,4'],
      timestamp: Date.now(),
      ethAddress: 'Some-address-without-permissions'
    })

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual('The provided Eth Address does not have access to the following parcel: (102,4)')
  })

  it(`When access URL is wrong while checking wearable access it reports an error`, async () => {
    const accessChecker = buildAccessCheckerImpl({ collectionsL1SubgraphUrl: 'Wrong URL' })
    const pointer = 'urn:decentraland:ethereum:collections-v2:0x1b8ba74cc34c2927aac0a8af9c3b1ba2e61352f2:0'
    const errors = await accessChecker.hasAccess({
      type: EntityType.WEARABLE,
      pointers: [pointer],
      timestamp: Date.now(),
      ethAddress: 'Some-address-without-permissions'
    })

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual(`The provided Eth Address does not have access to the following wearable: (${pointer})`)
  })

  it(`When an address without permissions tries to deploy a wearable it fails`, async () => {
    const accessChecker = buildAccessCheckerImpl({ collectionsL1SubgraphUrl: DEFAULT_COLLECTIONS_SUBGRAPH_ROPSTEN })
    const pointer = 'urn:decentraland:ethereum:collections-v2:0x1b8ba74cc34c2927aac0a8af9c3b1ba2e61352f2:0'

    const errors = await accessChecker.hasAccess({
      type: EntityType.WEARABLE,
      pointers: [pointer],
      timestamp: Date.now(),
      ethAddress: 'Some-address-without-permissions'
    })

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual(`The provided Eth Address does not have access to the following wearable: (${pointer})`)
  })

  function buildAccessCheckerImpl(params: Partial<AccessCheckerImplParams>) {
    const finalParams = {
      authenticator: new ContentAuthenticator(),
      fetcher: new Fetcher(),
      landManagerSubgraphUrl: 'Unused URL',
      collectionsL1SubgraphUrl: 'Unused URL',
      collectionsL2SubgraphUrl: 'Unused URL',
      blocksL1SubgraphUrl: 'Unused URL',
      blocksL2SubgraphUrl: 'Unused URL',
      ...params
    }
    return new AccessCheckerImpl(finalParams)
  }
})
