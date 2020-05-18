import Web3 from 'web3'
import EvmChains from 'evm-chains'
/**
 * Kick in the UI action after Web3modal dialog has chosen a provider
 */
export async function fetchAccountData(provider: any) {
  // Get a Web3 instance for the wallet
  const web3 = new Web3(provider)
  // Get connected chain id from Ethereum node
  const chainId = await web3.eth.getChainId()
  // Load chain information over an HTTP API
  const chainData = await EvmChains.getChain(chainId)
  // Get list of accounts of the connected wallet
  const accounts = await web3.eth.getAccounts()

  return {
    selectedAccount: accounts[0],
    chainData,
    chainId,
  }
}
