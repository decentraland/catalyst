import Web3Modal from 'web3modal'
import { fetchAccountData } from './fetchAccountData'
const WalletConnectProvider = require('@walletconnect/web3-provider')

const web3Modal = new Web3Modal({
  network: 'mainnet',
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        infuraId: '6ce1ac70b1af451d9c81c2d60453e3c3',
      },
    },
  },
})

/**
 * Connect wallet button pressed.
 */
export async function onConnect() {
  try {
    const provider = await web3Modal.connect()
    provider.on('accountsChanged', () => {
      fetchAccountData(provider)
    })
    provider.on('chainChanged', () => {
      fetchAccountData(provider)
    })
    provider.on('networkChanged', () => {
      fetchAccountData(provider)
    })
    return provider
  } catch (e) {
    console.log('Could not get a wallet connection', e)
    return
  }
}
