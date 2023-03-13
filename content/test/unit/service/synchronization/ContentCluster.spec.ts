import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { Response } from 'node-fetch'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { createFetchComponent } from '../../../../src/ports/fetcher'
import { ChallengeSupervisor, IChallengeSupervisor } from '../../../../src/service/synchronization/ChallengeSupervisor'
import { ContentCluster } from '../../../../src/service/synchronization/ContentCluster'
import { MockedDAOClient } from '../../../helpers/service/synchronization/clients/MockedDAOClient'

jest.mock('@dcl/snapshots-fetcher/dist/utils', () => ({
  ...jest.requireActual('@dcl/snapshots-fetcher/dist/utils'),
  sleep: jest.fn()
}))

describe('ContentCluster', function () {
  const address1: string = 'http://address1'
  const address2: string = 'http://address2'
  const challengeText: string = 'Some challenge text'

  beforeEach(() => jest.restoreAllMocks())

  // TODO: review this test, there is no real-world case in which the DAO has no servers
  xit(`When there are no servers on the DAO, then no identity is assigned`, async () => {
    const contentCluster = await new ContentClusterBuilder().build(address2)

    // Check that no identity was detected
    expect(await contentCluster.getIdentity()).toBeUndefined()
  })

  it(`When I'm on the DAO, then I can determine my identity`, async () => {
    const contentCluster = await new ContentClusterBuilder()
      .addAddressWithLocalChallenge(address1, challengeText)
      .build(address1)

    // Check that identity was detected
    const identity = await contentCluster.getIdentity()
    expect(identity?.domain).toEqual(address1)
  })

  it(`When I'm not on the DAO, then blank identity is assigned`, async () => {
    const contentCluster = await new ContentClusterBuilder().addLocalChallenge(address1, challengeText).build(address1)

    // Check that no identity was detected
    expect(await contentCluster.getIdentity()).toEqual({
      domain: address1,
      id: new Uint8Array(),
      owner: '0x0000000000000000000000000000000000000000'
    })
  })

  it(`When I'm not on the DAO and get no response, then no identity is assigned`, async () => {
    const contentCluster = await new ContentClusterBuilder().addLocalChallenge(address2, challengeText).build(address1)

    // Force the attemp interval to be 1000ms and match CI interval
    process.env.CI = 'true'
    // Check that no identity was detected
    expect(await contentCluster.getIdentity()).toBeUndefined()
    expect(sleep).toBeCalledTimes(10)
    expect(sleep).toHaveBeenCalledWith(1000)
  })
})

class ContentClusterBuilder {
  readonly servers: Set<string> = new Set()
  readonly fetcher = createFetchComponent()
  localChallenge: string | undefined

  addLocalChallenge(domain: string, challengeText: string): ContentClusterBuilder {
    const original = this.fetcher.fetch
    jest.spyOn(this.fetcher, 'fetch').mockImplementation(async (url) => {
      if (url === `${domain}/challenge`) {
        return new Response(JSON.stringify({ challengeText }))
      }
      {
        return original(url)
      }
    })
    this.localChallenge = challengeText
    return this
  }

  addAddressWithEndpoints(domain: string, challengeText: string): ContentClusterBuilder {
    const original = this.fetcher.fetch
    jest.spyOn(this.fetcher, 'fetch').mockImplementation(async (url) => {
      if (url === `${domain}/challenge`) {
        return new Response(JSON.stringify({ challengeText }))
      }
      {
        return original(url)
      }
    })
    this.servers.add(domain)
    return this
  }

  addAddressWithLocalChallenge(domain: string, challengeText: string): ContentClusterBuilder {
    this.localChallenge = challengeText
    return this.addAddressWithEndpoints(domain, challengeText)
  }

  async build(localAddress: string): Promise<ContentCluster> {
    const env = new Environment()
    const clock = { now: Date.now }

    const daoClient = MockedDAOClient.withAddresses(...this.servers.values())
    env.setConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, 1000)
    env.setConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, 10000)
    env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)

    const challengeSupervisor: IChallengeSupervisor = this.localChallenge
      ? {
          getChallengeText: () => this.localChallenge!,
          isChallengeOk: (text: string) => this.localChallenge === text
        }
      : new ChallengeSupervisor()

    const logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'DEBUG'
      })
    })

    return new ContentCluster(
      { daoClient, logs, challengeSupervisor, fetcher: this.fetcher, env, clock },
      env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
    )
  }
}
