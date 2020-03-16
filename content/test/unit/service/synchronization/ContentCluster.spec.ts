import { EnvironmentConfig, Bean, Environment } from "@katalyst/content/Environment";
import { ContentClusterFactory } from "@katalyst/content/service/synchronization/ContentClusterFactory";
import { ChallengeText } from "@katalyst/content/service/synchronization/ChallengeSupervisor";
import { MockedDAOClient } from "@katalyst/test-helpers/service/synchronization/clients/MockedDAOClient";
import { ContentCluster } from "@katalyst/content/service/synchronization/ContentCluster";
import { ServerName } from "@katalyst/content/service/naming/NameKeeper";
import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient";
import { MockedFetchHelper } from "../../helpers/MockedFetchHelper";

describe("ContentCluster", function () {

    const address1: ServerAddress = 'http://address1'
    const address2: ServerAddress = 'http://address2'
    const name1: ServerName = 'Server Name 1'
    const name2: ServerName = 'Server Name 2'
    const challengeText: ChallengeText = 'Some challenge text'

    it(`When there are no servers on the DAO, then no identity is assigned`, async () => {
        const contentCluster = new ContentClusterBuilder().build()

        // Try to detect the identity
        await contentCluster.detectMyIdentity()

        // Check that no identity was detected
        expect(contentCluster.getOwnIdentity()).toBeUndefined()
    })

    it(`When I'm on the DAO, then I can determine my identity`, async () => {
        const contentCluster = new ContentClusterBuilder()
            .addAddressWithLocalChallengeAndName(address1, challengeText, name1)
            .build()

        // Try to detect the identity
        await contentCluster.detectMyIdentity()

        // Check that identity was detected
        const identity = contentCluster.getOwnIdentity()!!;
        expect(identity.name).toEqual(name1)
        expect(identity.address).toEqual(address1)
    })

    it(`When I'm not on the DAO, then no identity is assigned`, async () => {
        const contentCluster = new ContentClusterBuilder()
            .addAddressWithEndpoints(address1, challengeText, name1)
            .build()

        // Try to detect the identity
        await contentCluster.detectMyIdentity()

        // Check that no identity was detected
        expect(contentCluster.getOwnIdentity()).toBeUndefined()
    })

    it(`When other servers have the same challenge as myself, then no identity is assigned`, async () => {
        const contentCluster = new ContentClusterBuilder()
            .addAddressWithLocalChallengeAndName(address1, challengeText, name1)
            .addAddressWithEndpoints(address2, challengeText, name2)
            .build()

        // Try to detect the identity
        await contentCluster.detectMyIdentity()

        // Check that no identity was detected
        expect(contentCluster.getOwnIdentity()).toBeUndefined()
    })

})

class ContentClusterBuilder {

    private readonly addresses: Set<ServerAddress> = new Set()
    private readonly fetchHelper: MockedFetchHelper = new MockedFetchHelper()
    private localChallenge: ChallengeText | undefined
    private localName: ServerName | undefined

    addAddress(address: ServerAddress): ContentClusterBuilder {
        this.addresses.add(address)
        return this
    }

    addAddressWithEndpoints(address: ServerAddress, challengeText: ChallengeText, name: ServerName): ContentClusterBuilder {
        this.fetchHelper.addJsonEndpoint(address, 'challenge', { challengeText })
        this.fetchHelper.addJsonEndpoint(address, 'status', {
            name,
            version: "version",
            currentTime: 10,
            lastImmutableTime: 10,
            historySize: 10,
        })
        this.addresses.add(address)
        return this;
    }

    addAddressWithLocalChallengeAndName(address: ServerAddress, challengeText: ChallengeText, name: ServerName): ContentClusterBuilder {
        this.localChallenge = challengeText
        this.localName = name
        return this.addAddressWithEndpoints(address, challengeText, name)
    }

    build(): ContentCluster {
        const env = new Environment();

        env.registerBean(Bean.DAO_CLIENT, MockedDAOClient.withAddresses(...this.addresses.values()))
        env.registerBean(Bean.FETCH_HELPER, this.fetchHelper)
        env.setConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, 1000)
        env.setConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, 10000)

        if (this.localName) {
            const nameKeeper = { getServerName: () => this.localName }
            env.registerBean(Bean.NAME_KEEPER, nameKeeper)
        }

        if (this.localChallenge) {
            const challengeSupervisor = { getChallengeText: () => this.localChallenge, isChallengeOk: (text: ChallengeText) => this.localChallenge === text }
            env.registerBean(Bean.CHALLENGE_SUPERVISOR, challengeSupervisor)
        }

        return ContentClusterFactory.create(env);
    }

}
