import { env } from 'decentraland-commons'
import Web3 = require('web3')
import { Token } from './types'
const ERC721 = require('../contracts/ERC721Full.json')

const INFURA_URL = env.get('INFURA_URL', '')

if (!INFURA_URL) {
  throw new Error('Empty INFURA_URL env variable')
}

type ERC721Contract = {
  methods: {
    tokenOfOwnerByIndex: (
      id: string,
      index: number | string
    ) => { call(): Promise<string> }
    balanceOf: (address: string) => { call(): Promise<string> }
    tokenURI: (id: string) => { call(): Promise<string> }
  }
}

const web3Accessor = {
  web3: new Web3(INFURA_URL),
  NFTContracts: {} as Record<string, any>
}

/**
 * Instantiate a ERC721 contract to be able to call it's methods
 */
export function getTokenContract(url: string): ERC721Contract {
  let finalUrl = url.startsWith('ethereum://') ? url.split('/')[2] : url
  if (!web3Accessor.NFTContracts[finalUrl]) {
    const contract = new web3Accessor.web3.eth.Contract(ERC721.abi, finalUrl)
    const methods = contract.methods
    methods.tokenOfOwnerByIndex = decorateAccess(
      methods.tokenOfOwnerByIndex.bind(contract)
    )
    methods.balanceOf = decorateAccess(methods.balanceOf.bind(contract))
    methods.tokenURI = decorateAccess(methods.tokenURI.bind(contract))
    web3Accessor.NFTContracts[finalUrl] = contract
  }

  return web3Accessor.NFTContracts[finalUrl]
}

/**
 * Obtains the token_uri for a particular NFT
 */
export function getTokenURI(token: Token): Promise<string> {
  const contract = getTokenContract(token.contract)
  return contract.methods.tokenURI(token.id).call()
}

/**
 * Obtains tokens (NFTs) for a particular ERC721 contract and a wallet address
 * It returns a representation of that NFT
 */
export async function getTokensForAddress(
  contractUri: string,
  address: string
): Promise<Token[]> {
  const items: Token[] = []
  const tokens: Promise<string>[] = []
  const contract = getTokenContract(contractUri)
  const balance = parseInt(await contract.methods.balanceOf(address).call(), 10)

  for (let i = 0; i < balance; i++) {
    tokens[i] = contract.methods.tokenOfOwnerByIndex(address, i).call()
  }
  const resolved = await Promise.all(tokens)

  for (let i = 0; i < balance; i++) {
    items.push({
      network: 'ethereum',
      contract: contractUri,
      id: resolved[i]
    })
  }
  return items
}

/**
 * Tries to call a web3 method, it'll retry 'retries' times before throwing
 */
function decorateAccess(fn: Function, retries = 2) {
  return function(...args: any[]) {
    while (true) {
      try {
        return fn(...args)
      } catch (e) {
        web3Accessor.NFTContracts = {}
        web3Accessor.web3 = new Web3(INFURA_URL)

        if (retries === 0) {
          throw e
        } else {
          retries -= 1
        }
      }
    }
  }
}
