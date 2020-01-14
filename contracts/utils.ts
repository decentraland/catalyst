import { Address } from "web3x/address";
import { Eth } from "web3x/eth";
import { WebsocketProvider } from "web3x/providers";
import { Katalyst } from "./Katalyst";

type Network = typeof networks.ropsten;
// type Provider = ReturnType<typeof handlerForNetwork>;
type Contract = keyof typeof networks.ropsten.contracts;

export const networks = {
  ropsten: {
    wss: "wss://ropsten.infura.io/ws",
    contracts: {
      katalyst: {
        address: "0x89550d8fc174b2ca216f2bd1bc20128413a2ab9d",
        class: Katalyst
      }
    }
  }
};

export function handlerForNetwork(network: Network, contractConfig: Contract) {
  const provider = new WebsocketProvider(network.wss);
  const eth = new Eth(provider);
  const contract = network.contracts[contractConfig];
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
}

// async function main() {
//   const { contract, disconnect } = handlerForNetwork(networks.ropsten, "katalyst");

//   contract.methods.katalystCount().call();

//   const count = await contract.methods.katalystCount().call();
//   console.log(`Katalyst nodes count: ${count}`);

//   const ids = await contract.methods.katalystIds(0).call();
//   console.log(`Katalyst node ids: ${ids}`);

//   const url = await contract.methods.katalystById(ids).call();
//   console.log(`Katalyst node URL: ${JSON.stringify(url)}`);

//   disconnect();
// }
