import { ServerAddress } from "../../../../src/service/synchronization/clients/contentserver/ContentServerClient";
import { DAOClient } from "../../../../src/service/synchronization/clients/DAOClient";

export function mockDAOWith(...serverAddresses: ServerAddress[]): DAOClient {
    return {
        registerServerInDAO: () => Promise.resolve(),
        getAllServers: () => Promise.resolve(new Set(serverAddresses)),
    }
}