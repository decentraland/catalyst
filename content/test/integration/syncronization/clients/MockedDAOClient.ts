import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient";
import { DAOClient } from "@katalyst/content/service/synchronization/clients/DAOClient";
import { ServerMetadata } from "@katalyst/content/service/synchronization/ContentCluster";
import { EthAddress } from "@katalyst/content/service/auth/Authenticator";

export class MockedDAOClient extends DAOClient {

    private readonly servers: Map<string, ServerMetadata>

    private constructor(servers: {address: ServerAddress, owner: EthAddress}[]) {
        super()
        this.servers = new Map(servers.map(server => [server.address, {...server, id: "Id"}]))
    }

    async getAllServers(): Promise<Set<ServerMetadata>> {
        return new Set(this.servers.values())
    }

    remove(address: ServerAddress) {
        this.servers.delete(address)
    }

    static withAddresses(...addresses: ServerAddress[]): MockedDAOClient {
        return new MockedDAOClient(addresses.map(address => ({ address, owner: "0x..."})))
    }
    static with(address: ServerAddress, owner: EthAddress): MockedDAOClient {
        return new MockedDAOClient([{ address, owner }])
    }

}