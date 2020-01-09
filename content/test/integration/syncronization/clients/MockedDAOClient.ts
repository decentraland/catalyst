import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient";
import { DAOClient } from "@katalyst/content/service/synchronization/clients/DAOClient";

export class MockedDAOClient extends DAOClient {

    private constructor(private addresses: Set<ServerAddress>) {
        super("Will not be using this")
    }

    registerServerInDAO(address: ServerAddress): Promise<void> {
        return Promise.resolve()
    }

    getAllServers(): Promise<Set<ServerAddress>> {
        return Promise.resolve(this.addresses)
    }

    remove(address: ServerAddress) {
        this.addresses.delete(address)
    }

    static with(...addresses: ServerAddress[]): MockedDAOClient {
        return new MockedDAOClient(new Set(addresses))
    }
}