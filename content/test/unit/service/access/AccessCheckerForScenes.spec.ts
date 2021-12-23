import { DECENTRALAND_ADDRESS } from '@catalyst/commons'
import { createLogComponent } from '@well-known-components/logger'
import { Fetcher } from 'dcl-catalyst-commons'
import { AccessCheckerForScenes } from '../../../../src/service/access/AccessCheckerForScenes'
import { AccessCheckerImplParams } from '../../../../src/service/access/AccessCheckerImpl'
import { ContentAuthenticator } from '../../../../src/service/auth/Authenticator'

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
      authenticator: new ContentAuthenticator(''),
      fetcher: new Fetcher(),
      landManagerSubgraphUrl: 'Unused URL',
      ...params
    }
    const logger = createLogComponent().getLogger('AccessCheckerForTests')
    return new AccessCheckerForScenes(authenticator, fetcher, landManagerSubgraphUrl, logger)
  }
})
