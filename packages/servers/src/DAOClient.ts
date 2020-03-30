import { handlerForNetwork } from "decentraland-katalyst-contracts";
import { ServerMetadata } from "./ServerMetadata";
import { Catalyst } from "decentraland-katalyst-contracts";

export class DAOClient {
  private contract: Catalyst;
  private triggerDisconnect;

  constructor(networkName: string) {
    const handler = handlerForNetwork(networkName, "catalyst");
    if (handler) {
      const { contract, disconnect } = handler;
      this.contract = contract;
      this.triggerDisconnect = disconnect;
    } else {
      throw new Error(`Can not find a network handler for Network="${networkName}`);
    }
  }

  async getAllContentServers(): Promise<Set<ServerMetadata>> {
    const servers: Set<ServerMetadata> = await this.getAllServers();
    return new Set(Array.from(servers.values()).map(server => ({ ...server, address: server.address + "/content" })));
  }

  async getAllServers(): Promise<Set<ServerMetadata>> {
    const result: Set<ServerMetadata> = new Set();

    const count = parseInt(await this.contract.methods.catalystCount().call());

    for (let i = 0; i < count; i++) {
      try {
        const katalystId = await this.contract.methods.catalystIds(i).call();
        let { id, owner, domain } = await this.contract.methods.catalystById(katalystId).call();

        if (domain.startsWith("http://")) {
          console.warn(`Catalyst node domain using http protocol, skipping ${domain}`);
          continue;
        }

        if (!domain.startsWith("https://")) {
          domain = "https://" + domain;
        }

        result.add({ address: domain, owner: owner.toJSON(), id });
      } catch (error) {}
    }

    return result;
  }

  disconnect() {
    this.triggerDisconnect();
  }
}
