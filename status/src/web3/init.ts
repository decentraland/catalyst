import Web3Modal from 'web3modal'
const WalletConnectProvider = require('@walletconnect/web3-provider')

/**
 * Setup the orchestra
 */
export function init() {
  console.log('Initializing example')
  console.log('WalletConnectProvider is', WalletConnectProvider)
  // Tell Web3modal what providers we have available.
  // Built-in web browser provider (only one can exist as a time)
  // like MetaMask, Brave or Opera is added automatically by Web3modal
  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
        // Mikko's test key - don't copy as your mileage may vary
        infuraId: '6ce1ac70b1af451d9c81c2d60453e3c3',
      },
    },
  }
  const web3Modal = new Web3Modal({
    cacheProvider: false,
    providerOptions,
  })
  return web3Modal
}
