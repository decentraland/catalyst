import { ServerAddress } from 'dcl-catalyst-commons'
import { EnvironmentConfig, Bean, Environment } from '@katalyst/content/Environment'
import { ContentClusterFactory } from '@katalyst/content/service/synchronization/ContentClusterFactory'
import { ChallengeText } from '@katalyst/content/service/synchronization/ChallengeSupervisor'
import { MockedDAOClient } from '@katalyst/test-helpers/service/synchronization/clients/MockedDAOClient'
import { ContentCluster } from '@katalyst/content/service/synchronization/ContentCluster'
import { MockedFetcher } from '../../helpers/MockedFetcher'

describe('ContentCluster', function () {
  const address1: ServerAddress = 'http://address1'
  const address2: ServerAddress = 'http://address2'
  const challengeText: ChallengeText = 'Some challenge text'

  it(`When there are no servers on the DAO, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder().build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity()

    // Check that no identity was detected
    expect(contentCluster.getIdentityInDAO()).toBeUndefined()
  })

  it(`When I'm on the DAO, then I can determine my identity`, async () => {
    const contentCluster = new ContentClusterBuilder().addAddressWithLocalChallenge(address1, challengeText).build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity()

    // Check that identity was detected
    const identity = contentCluster.getIdentityInDAO()!
    expect(identity.address).toEqual(address1)
  })

  it(`When I'm not on the DAO, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder().addAddressWithEndpoints(address1, challengeText).build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity()

    // Check that no identity was detected
    expect(contentCluster.getIdentityInDAO()).toBeUndefined()
  })

  it(`When other servers have the same challenge as myself, then no identity is assigned`, async () => {
    const contentCluster = new ContentClusterBuilder()
      .addAddressWithLocalChallenge(address1, challengeText)
      .addAddressWithEndpoints(address2, challengeText)
      .build()

    // Try to detect the identity
    await contentCluster.detectMyIdentity()

    // Check that no identity was detected
    expect(contentCluster.getIdentityInDAO()).toBeUndefined()
  })
})

class ContentClusterBuilder {
  private readonly addresses: Set<ServerAddress> = new Set()
  private readonly fetchHelper: MockedFetcher = new MockedFetcher()
  private localChallenge: ChallengeText | undefined

  addAddress(address: ServerAddress): ContentClusterBuilder {
    this.addresses.add(address)
    return this
  }

  addAddressWithEndpoints(address: ServerAddress, challengeText: ChallengeText): ContentClusterBuilder {
    this.fetchHelper.addJsonEndpoint(address, 'challenge', { challengeText })
    this.fetchHelper.addJsonEndpoint(address, 'status', {
      name: encodeURIComponent(address),
      version: 'version',
      currentTime: 10,
      lastImmutableTime: 10,
      historySize: 10
    })
    this.addresses.add(address)
    return this
  }

  addAddressWithLocalChallenge(address: ServerAddress, challengeText: ChallengeText): ContentClusterBuilder {
    this.localChallenge = challengeText
    return this.addAddressWithEndpoints(address, challengeText)
  }

  build(): ContentCluster {
    const env = new Environment()

    env.registerBean(Bean.DAO_CLIENT, MockedDAOClient.withAddresses(...this.addresses.values()))
    env.registerBean(Bean.FETCHER, this.fetchHelper)
    env.setConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, 1000)
    env.setConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, 10000)

    if (this.localChallenge) {
      const challengeSupervisor = {
        getChallengeText: () => this.localChallenge,
        isChallengeOk: (text: ChallengeText) => this.localChallenge === text
      }
      env.registerBean(Bean.CHALLENGE_SUPERVISOR, challengeSupervisor)
    }

    return ContentClusterFactory.create(env)
  }
}
