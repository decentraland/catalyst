import { handlerForNetwork } from "decentraland-katalyst-contracts/utils";
import { List } from "decentraland-katalyst-contracts/List";

export class DAOListContract {

    private constructor(private readonly contract: List) { }

    async getCount(): Promise<number> {
        return parseInt(await this.contract.methods.size().call())
    }

    getValueByIndex(index: number): Promise<string> {
        return this.contract.methods.values(index).call();
    }

    static withNetwork(networkName: string, contractKey: DAOListContractsKeys): DAOListContract {
        const handler = handlerForNetwork(networkName, contractKey);
        if (handler) {
            return new DAOListContract(handler.contract);
        } else {
            throw new Error(`Can not find a network handler for Network="${networkName}" and Contract Key="${contractKey}"`);
        }
    }
}

export enum DAOListContractsKeys {
    POIs = "POIs",
    denylistedNames = "denylistedNames"
}