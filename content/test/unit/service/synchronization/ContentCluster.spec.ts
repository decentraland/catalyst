import { ServerBaseUrl } from '@catalyst/commons'
import { createLogComponent } from '@well-known-components/logger'
import { Response } from 'node-fetch'
import { stub } from 'sinon'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { createFetchComponent } from '../../../../src/ports/fetcher'
import { ChallengeSupervisor, IChallengeSupervisor } from '../../../../src/service/synchronization/ChallengeSupervisor'
import { ContentCluster } from '../../../../src/service/synchronization/ContentCluster'
import { MockedDAOClient } from '../../../helpers/service/synchronization/clients/MockedDAOClient'

describe('ContentCluster', function () {
  const address1: ServerBaseUrl = 'http://address1'
  const address2: ServerBaseUrl = 'http://address2'
  const challengeText: string = 'Some challenge text'

  it(`When there are no servers on the DAO, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder().build(address2)

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that no identity was detected
    expect(await contentCluster.getIdentity()).toBeUndefined()
  })

  it(`When I'm on the DAO, then I can determine my identity`, async () => {
    const contentCluster = new ContentClusterBuilder()
      .addAddressWithLocalChallenge(address1, challengeText)
      .build(address1)

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that identity was detected
    const identity = await contentCluster.getIdentity()
    expect(identity?.baseUrl).toEqual(address1)
  })

  it(`When I'm not on the DAO, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder().addAddressWithEndpoints(address1, challengeText).build(address1)

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that no identity was detected
    expect(await contentCluster.getIdentity()).toBeUndefined()
  })

  it(`When other servers have the same challenge as myself, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder()
      .addAddressWithLocalChallenge(address1, challengeText)
      .addAddressWithEndpoints(address2, challengeText)
      .build(address1)

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that no identity was detected
    expect(await contentCluster.getIdentity()).toBeUndefined()
  })
})

class ContentClusterBuilder {
  private readonly servers: Set<ServerBaseUrl> = new Set()
  private readonly fetcher = stub(createFetchComponent())
  private localChallenge: string | undefined

  addAddress(baseUrl: ServerBaseUrl): ContentClusterBuilder {
    this.servers.add(baseUrl)
    return this
  }

  addAddressWithEndpoints(baseUrl: ServerBaseUrl, challengeText: string): ContentClusterBuilder {
    this.fetcher.fetch.withArgs(`${baseUrl}/challenge`).resolves(new Response(JSON.stringify({ challengeText })))
    this.servers.add(baseUrl)
    return this
  }

  addAddressWithLocalChallenge(baseUrl: ServerBaseUrl, challengeText: string): ContentClusterBuilder {
    this.localChallenge = challengeText
    return this.addAddressWithEndpoints(baseUrl, challengeText)
  }

  build(localAddress: string): ContentCluster {
    const env = new Environment()

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

    const logs = createLogComponent()

    return new ContentCluster(
      { daoClient, logs, challengeSupervisor, fetcher: this.fetcher, env },
      env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
    )
  }
}
