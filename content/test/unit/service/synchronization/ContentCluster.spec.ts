import { ServerBaseUrl } from '@catalyst/commons'
import { createLogComponent } from '@well-known-components/logger'
import { Response } from 'node-fetch'
import { stub } from 'sinon'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { createFetchComponent } from '../../../../src/ports/fetcher'
import {
  ChallengeSupervisor,
  ChallengeText,
  IChallengeSupervisor
} from '../../../../src/service/synchronization/ChallengeSupervisor'
import { ContentCluster } from '../../../../src/service/synchronization/ContentCluster'
import { MockedDAOClient } from '../../../helpers/service/synchronization/clients/MockedDAOClient'

describe('ContentCluster', function () {
  const address1: ServerBaseUrl = 'http://address1'
  const address2: ServerBaseUrl = 'http://address2'
  const challengeText: ChallengeText = 'Some challenge text'

  it(`When there are no servers on the DAO, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder().build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that no identity was detected
    expect(contentCluster.getIdentityInDAO()).toBeUndefined()
  })

  it(`When I'm on the DAO, then I can determine my identity`, async () => {
    const contentCluster = new ContentClusterBuilder().addAddressWithLocalChallenge(address1, challengeText).build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that identity was detected
    const identity = contentCluster.getIdentityInDAO()
    expect(identity?.baseUrl).toEqual(address1)
  })

  it(`When I'm not on the DAO, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder().addAddressWithEndpoints(address1, challengeText).build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that no identity was detected
    expect(contentCluster.getIdentityInDAO()).toBeUndefined()
  })

  it(`When other servers have the same challenge as myself, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder()
      .addAddressWithLocalChallenge(address1, challengeText)
      .addAddressWithEndpoints(address2, challengeText)
      .build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity(1)

    // Check that no identity was detected
    expect(contentCluster.getIdentityInDAO()).toBeUndefined()
  })
})

class ContentClusterBuilder {
  private readonly servers: Set<ServerBaseUrl> = new Set()
  private readonly fetcher = stub(createFetchComponent())
  private localChallenge: ChallengeText | undefined

  addAddress(baseUrl: ServerBaseUrl): ContentClusterBuilder {
    this.servers.add(baseUrl)
    return this
  }

  addAddressWithEndpoints(baseUrl: ServerBaseUrl, challengeText: ChallengeText): ContentClusterBuilder {
    this.fetcher.fetch.withArgs(`${baseUrl}/challenge`).resolves(new Response(JSON.stringify({ challengeText })))
    this.servers.add(baseUrl)
    return this
  }

  addAddressWithLocalChallenge(baseUrl: ServerBaseUrl, challengeText: ChallengeText): ContentClusterBuilder {
    this.localChallenge = challengeText
    return this.addAddressWithEndpoints(baseUrl, challengeText)
  }

  build(): ContentCluster {
    const env = new Environment()

    const daoClient = MockedDAOClient.withAddresses(...this.servers.values())
    env.setConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, 1000)
    env.setConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, 10000)

    const challengeSupervisor: IChallengeSupervisor = this.localChallenge
      ? {
          getChallengeText: () => this.localChallenge!,
          isChallengeOk: (text: ChallengeText) => this.localChallenge === text
        }
      : new ChallengeSupervisor()

    const logs = createLogComponent()

    return new ContentCluster(
      { daoClient, logs, challengeSupervisor, fetcher: this.fetcher },
      env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
    )
  }
}
