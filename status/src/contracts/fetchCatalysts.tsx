import { Address } from "web3x/address";
import { Eth } from "web3x/eth";
import { WebsocketProvider } from "web3x/providers/ws";
import { Catalyst } from "./Catalyst";
import { range } from "../components/range";

export const fetchCatalysts = async () => {
  const wss = new WebsocketProvider("wss://mainnet.infura.io/ws/v3/6ce1ac70b1af451d9c81c2d60453e3c3");
  const eth = new Eth(wss);
  const contract = new Catalyst(eth, Address.fromString("0x4a2f10076101650f40342885b99b6b101d83c486"));
  const number = parseInt(await contract.methods.catalystCount().call(), 10);
  const ids = await Promise.all(range(number).map((_) => contract.methods.catalystIds("" + _).call()));
  console.log("✅");
  const result = [];
  for (let i = 0; i < number; i++) {
    result.push(contract.methods.catalystDomain(ids[i]).call());
    result.push(contract.methods.catalystOwner(ids[i]).call());
  }
  const resolved = await Promise.all(result as any);
  return range(number).map((_) => ({ owner: resolved[_ * 2 + 1], domain: resolved[_ * 2] }));
};

/**
 * Sample usage:
 * fetchCatalysts()
 *   .then((_: any) => console.log("🥂", _))
 *   .catch((_) => console.log("🗺", _));
 */
