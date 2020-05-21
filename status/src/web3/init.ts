import Web3Modal from 'web3modal'
const WalletConnectProvider = require('@walletconnect/web3-provider')

/**
 * Setup the orchestra
 */
export function init() {
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
