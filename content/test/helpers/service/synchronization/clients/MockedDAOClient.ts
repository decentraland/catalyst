import { mock, instance } from "ts-mockito";
import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient";
import { DAOClient } from "decentraland-katalyst-commons/DAOClient";
import { ServerMetadata } from "decentraland-katalyst-commons/ServerMetadata";
import { EthAddress } from 'dcl-crypto';
import { DAOContract } from "decentraland-katalyst-contracts/DAOContract";

export class MockedDAOClient extends DAOClient {

    private readonly serversByAddress: Map<ServerAddress, ServerMetadata>

    private constructor(servers: {address: ServerAddress, owner: EthAddress}[]) {
        super(instance(mock(DAOContract)))
        this.serversByAddress = new Map(servers.map(server => [server.address, {...server, id: "Id"}]))
    }

    async getAllContentServers(): Promise<Set<ServerMetadata>> {
        return new Set(this.serversByAddress.values())
    }

    add(address: ServerAddress) {
        this.serversByAddress.set(address, { address, owner: "0x...", id: "Id"} )
    }

    remove(address: ServerAddress) {
        this.serversByAddress.delete(address)
    }

    static withAddresses(...addresses: ServerAddress[]): MockedDAOClient {
        return new MockedDAOClient(addresses.map(address => ({ address, owner: "0x..."})))
    }
    static with(address: ServerAddress, owner: EthAddress): MockedDAOClient {
        return new MockedDAOClient([{ address, owner }])
    }

}