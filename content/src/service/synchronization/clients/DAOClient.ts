import { handlerForNetwork, networks } from "decentraland-katalyst-contracts/utils"
import { ServerMetadata } from "../ContentCluster";

export class DAOClient {

    private contract
    private triggerDisconnect

    constructor() {
        const { contract, disconnect } = handlerForNetwork(networks.ropsten, "katalyst");
        this.contract = contract
        this.triggerDisconnect = disconnect
    }

    async getAllServers(): Promise<Set<ServerMetadata>> {
        const result: Set<ServerMetadata> = new Set()

        let count = 0
        try {
            count = parseInt(await this.contract.methods.katalystCount().call());
        } catch(error) { }

        for (let i = 0; i < count; i++) {
            try {
                const katalystId = await this.contract.methods.katalystIds(i).call();
                const { id, owner, domain } = await this.contract.methods.katalystById(katalystId).call();
                result.add({ address: domain, owner, id })
            } catch(error) { }
        }

        return result
    }

    disconnect() {
        this.triggerDisconnect()
    }

}
