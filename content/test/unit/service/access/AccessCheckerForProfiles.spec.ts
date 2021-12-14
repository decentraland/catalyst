import { DECENTRALAND_ADDRESS } from '@catalyst/commons'
import { AccessCheckerForProfiles } from '../../../../src/service/access/AccessCheckerForProfiles'
import { ContentAuthenticator } from '../../../../src/service/auth/Authenticator'

describe('AccessCheckerForProfiles', function () {
  it(`When a non-decentraland address tries to deploy an default profile, then an error is returned`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({ pointers: ['Default10'], ethAddress: '0xAddress' })

    expect(errors).toContain('Only Decentraland can add or modify default profiles')
  })

  it(`When a decentraland address tries to deploy an default profile, then it is allowed`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({ pointers: ['Default10'], ethAddress: DECENTRALAND_ADDRESS })

    expect(errors.length).toBe(0)
  })

  it(`When a profile is created by its own address, then it is valid`, async () => {
    const someAddress = '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c'
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({ pointers: [someAddress], ethAddress: someAddress })

    expect(errors.length).toBe(0)
  })

  it(`When a profile is created and too many pointers are sent, the access check fails`, async () => {
    const addresses = ['some-address-1', 'some-address=2']
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({ pointers: addresses, ethAddress: 'some-address' })

    expect(errors).toEqual([`Only one pointer is allowed when you create a Profile. Received: ${addresses}`])
  })

  it(`When a profile is created and the pointers does not match the signer, the access check fails`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({
      pointers: ['0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c'],
      ethAddress: '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4a'
    })

    expect(errors.length).toEqual(1)

    expect(errors[0]).toContain(
      `You can only alter your own profile. The pointer address and the signer address are different`
    )
  })

  it(`When a profile is created and the pointers are not eth addresses it fails`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({ pointers: ['some-address'], ethAddress: 'some-other-address' })

    expect(errors.length).toEqual(1)

    expect(errors[0]).toContain(`The given pointer is not a valid ethereum address.`)
  })

  function buildAccessChecker() {
    const authenticator = new ContentAuthenticator('')
    return new AccessCheckerForProfiles(authenticator)
  }
})
