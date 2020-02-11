import { Address } from "web3x/address";
import { Eth } from "web3x/eth";
import { WebsocketProvider, HttpProvider } from "web3x/providers";
import { Catalyst } from "./Catalyst";

export const networks = {
  ropsten: {
    wss: "wss://ropsten.infura.io/ws/v3/d5eed066e203446197a3c9fa03a8a1ba",
    http: "https://ropsten.infura.io/v3/d5eed066e203446197a3c9fa03a8a1ba",
    contracts: {
      catalyst: {
        address: "0xadd085f2318e9678bbb18b3e0711328f902b374b",
        class: Catalyst
      }
    }
  },
  mainnet: {
    wss: "wss://mainnet.infura.io/ws/v3/d5eed066e203446197a3c9fa03a8a1ba",
    http: "https://mainnet.infura.io/v3/d5eed066e203446197a3c9fa03a8a1ba",
    contracts: {
      catalyst: {
        address: "0x4a2f10076101650f40342885b99b6b101d83c486",
        class: Catalyst
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

export function httpProviderForNetwork(networkKey: string) {
  const network = networks[networkKey];
  const url = network.http;
  return new HttpProvider(url);
}
