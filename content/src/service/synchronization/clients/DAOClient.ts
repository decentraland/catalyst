import { ServerAddress } from "./contentserver/ContentServerClient";
import { handlerForNetwork, networks } from "decentraland-katalyst-contracts/utils"

export class DAOClient {

    // private contract
    private triggerDisconnect

    constructor() {
        const { disconnect } = handlerForNetwork(networks.ropsten, "katalyst");
        // this.contract = contract
        this.triggerDisconnect = disconnect
    }

    async getAllServers(): Promise<Set<ServerAddress>> {
        return new Set(['https://katalyst-content.decentraland.zone'])
        // const result: Set<ServerAddress> = new Set()

        // let count = 0
        // try {
        //     count = parseInt(await this.contract.methods.katalystCount().call());
        // } catch(error) { }

        // for (let i = 0; i < count; i++) {
        //     try {
        //         const id = await this.contract.methods.katalystIds(i).call();
        //         const url: string = await this.contract.methods.katalystDomain(id).call();
        //         result.add(url)
        //     } catch(error) { }
        // }

        // return result
    }

    disconnect() {
        this.triggerDisconnect()
    }

}
