import { Address } from "web3x/address";
import { Eth } from "web3x/eth";
import { WebsocketProvider } from "web3x/providers";
import { Katalyst } from "./Katalyst";

export const networks = {
  ropsten: {
    wss: "wss://ropsten.infura.io/ws",
    contracts: {
      katalyst: {
        address: "0x89550d8fc174b2ca216f2bd1bc20128413a2ab9d",
        class: Katalyst
      }
    }
  },
  mainnet: {
    wss: "wss://mainnet.infura.io/ws",
    contracts: {
      katalyst: {
        address: "0x2a187453064356c898cae034eaed119e1663acb8",
        class: Katalyst
      }
    }
  }
};

export function handlerForNetwork(networkKey: string, contractKey: string) {
  try {
    const network = networks[networkKey];
    const provider = new WebsocketProvider(network.wss);
    const eth = new Eth(provider);
    const contract = network.contracts[contractKey];
    const address = Address.fromString(contract.address);
    const contractInstance = new contract.class(eth, address);

    return {
      provider,
      network,
      contract: contractInstance,
      disconnect: () => {
        provider.disconnect();
      }
    };
  } catch (error) {
    return undefined;
  }
}
