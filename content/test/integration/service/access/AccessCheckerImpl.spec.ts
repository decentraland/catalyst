import {
  DEFAULT_DCL_COLLECTIONS_ACCESS_URL_ROPSTEN,
  DEFAULT_DCL_PARCEL_ACCESS_URL_ROPSTEN
} from '@katalyst/content/Environment'
import { AccessCheckerImpl } from '@katalyst/content/service/access/AccessCheckerImpl'
import { ContentAuthenticator } from '@katalyst/content/service/auth/Authenticator'
import { EntityType, Fetcher } from 'dcl-catalyst-commons'

describe('Integration - AccessCheckerImpl', function () {
  it(`When access URL is wrong while checking scene access it reports an error`, async () => {
    const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), new Fetcher(), 'Wrong URL', 'Unused URL')

    const errors = await accessChecker.hasAccess(
      EntityType.SCENE,
      ['102,4'],
      Date.now(),
      'Some-address-without-permissions'
    )

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual('The provided Eth Address does not have access to the following parcel: (102,4)')
  })

  it(`When an address without permissions tries to deploy a scene it fails`, async () => {
    const accessChecker = new AccessCheckerImpl(
      new ContentAuthenticator(),
      new Fetcher(),
      DEFAULT_DCL_PARCEL_ACCESS_URL_ROPSTEN,
      'Unused URL'
    )

    const errors = await accessChecker.hasAccess(
      EntityType.SCENE,
      ['102,4'],
      Date.now(),
      'Some-address-without-permissions'
    )

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual('The provided Eth Address does not have access to the following parcel: (102,4)')
  })

  it(`When access URL is wrong while checking wearable access it reports an error`, async () => {
    const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), new Fetcher(), 'Unused URL', 'Wrong URL')
    const pointer = 'urn:decentraland:ethereum:collections-v2:0x1b8ba74cc34c2927aac0a8af9c3b1ba2e61352f2:0'
    const errors = await accessChecker.hasAccess(
      EntityType.WEARABLE,
      [pointer],
      Date.now(),
      'Some-address-without-permissions'
    )

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual(`The provided Eth Address does not have access to the following wearable: (${pointer})`)
  })

  it(`When an address without permissions tries to deploy a wearable it fails`, async () => {
    const accessChecker = new AccessCheckerImpl(
      new ContentAuthenticator(),
      new Fetcher(),
      'Unused URL',
      DEFAULT_DCL_COLLECTIONS_ACCESS_URL_ROPSTEN
    )
    const pointer = 'urn:decentraland:ethereum:collections-v2:0x1b8ba74cc34c2927aac0a8af9c3b1ba2e61352f2:0'

    const errors = await accessChecker.hasAccess(
      EntityType.WEARABLE,
      [pointer],
      Date.now(),
      'Some-address-without-permissions'
    )

    expect(errors.length).toBe(1)
    expect(errors[0]).toEqual(`The provided Eth Address does not have access to the following wearable: (${pointer})`)
  })
})
