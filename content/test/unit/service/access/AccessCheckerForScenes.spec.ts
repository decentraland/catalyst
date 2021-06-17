import { AccessCheckerForScenes } from '@katalyst/content/service/access/AccessCheckerForScenes'
import { AccessCheckerImplParams } from '@katalyst/content/service/access/AccessCheckerImpl'
import { ContentAuthenticator } from '@katalyst/content/service/auth/Authenticator'
import { Fetcher } from 'dcl-catalyst-commons'
import { DECENTRALAND_ADDRESS } from 'decentraland-katalyst-commons/addresses'
import { Logger } from 'log4js'
import { mock } from 'ts-mockito'

describe('AccessCheckerForScenes', function () {
  it(`When a non-decentraland address tries to deploy an default scene, then an error is returned`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({
      pointers: ['Default10'],
      timestamp: Date.now(),
      ethAddress: '0xAddress'
    })

    expect(errors).toContain('Only Decentraland can add or modify default scenes')
  })

  it(`When a decentraland address tries to deploy an default scene, then it is allowed`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.checkAccess({
      pointers: ['Default10'],
      timestamp: Date.now(),
      ethAddress: DECENTRALAND_ADDRESS
    })

    expect(errors.length).toBe(0)
  })

  function buildAccessChecker(params?: Partial<AccessCheckerImplParams>): AccessCheckerForScenes {
    const { authenticator, fetcher, landManagerSubgraphUrl } = {
      authenticator: new ContentAuthenticator(),
      fetcher: new Fetcher(),
      landManagerSubgraphUrl: 'Unused URL',
      ...params
    }
    return new AccessCheckerForScenes(authenticator, fetcher, landManagerSubgraphUrl, mock(Logger))
  }
})
