import { handlerForNetwork } from "decentraland-katalyst-contracts/utils";
import { ServerMetadata } from "./ServerMetadata";
import { Catalyst } from "decentraland-katalyst-contracts/Catalyst";

export class DAOClient {
  private contract: Catalyst;
  private triggerDisconnect;

  constructor(networkName: string) {
    const handler = handlerForNetwork(networkName, "katalyst");
    if (handler) {
      const { contract, disconnect } = handler;
      this.contract = contract;
      this.triggerDisconnect = disconnect;
    } else {
      throw new Error(`Can not find a network handler for Network="${networkName}`);
    }
  }

  async getAllServers(): Promise<Set<ServerMetadata>> {
    const result: Set<ServerMetadata> = new Set();

    let count = 0;
    try {
      count = parseInt(await this.contract.methods.catalystCount().call());
    } catch (error) {}

    for (let i = 0; i < count; i++) {
      try {
        const katalystId = await this.contract.methods.catalystIds(i).call();
        const { id, owner, domain } = await this.contract.methods.catalystById(katalystId).call();
        result.add({ address: domain, owner: owner.toJSON(), id });
      } catch (error) {}
    }

    return result;
  }

  disconnect() {
    this.triggerDisconnect();
  }
}
