import { L1Checker, L2Checker } from '@dcl/content-validator'
import { inputCallFormatter, inputBlockNumberFormatter } from './formatters'
import { RequestManager, HTTPProvider, ContractFactory, toData } from 'eth-connect'
import { code } from './code'

// TODO: use stateOverride depending on the block
export const checkerContracts = {
  goerli: '0xe69DD486AC000186Af573361Fb454Bbbb85AdD85',
  mainnet: '0x49fd6E40548A67a3FB9cA4fE22ab87885ba10454',
  mumbai: '0x04149Af3ceDF7a84b37e246a116f0aE4eD429141',
  polygon: '0xC2D0637FE019817b7B307b9B966E4400EB4aC165'
}

export const l1Contracts = {
  goerli: {
    registrar: '0x6b8da2752827cf926215b43bb8E46Fd7b9dDac35',
    landContract: '0x25b6B4bac4aDB582a0ABd475439dA6730777Fbf7',
    stateContract: '0xC9A46712E6913c24d15b46fF12221a79c4e251DC'
  },
  mainnet: {
    registrar: '0x2a187453064356c898cae034eaed119e1663acb8',
    landContract: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
    stateContract: '0x959e104e1a4db6317fa58f8295f586e1a978c297'
  }
}

const l2Contracts = {
  mumbai: {
    thirdParty: '0xEDf516F2D42A47F9cE0B145Fe0dbB76975379889',
    factories: [
      { address: '0x2A72Ec4241Ac4fBc915ae98aC5a5b01AdE721f4B', sinceBlock: 14517381 },
      { address: '0xDDb3781Fff645325C8896AA1F067bAa381607ecc', sinceBlock: 26012021 }
    ],
    commitees: [
      { address: '0x4bb5ACe5ceB3Dd51ea35fa01a8f9B5507c234270', sinceBlock: 14517376 },
      { address: '0xe18B1361d41afC44658216F3Dc27e48c2336e3c2', sinceBlock: 18881998 }
    ]
  },
  polygon: {
    thirdParty: '0x1C436C1EFb4608dFfDC8bace99d2B03c314f3348',
    factories: [
      {
        address: '0xB549B2442b2BD0a53795BC5cDcBFE0cAF7ACA9f8',
        sinceBlock: 15202563
      },
      {
        address: '0x3195e88aE10704b359764CB38e429D24f1c2f781',
        sinceBlock: 28121692
      }
    ],
    commitees: [
      { address: '0x71d9350Ef44E1e451F00e447C0DfF2d1FB75510a', sinceBlock: 15202559 },
      { address: '0xaeec95a8aa671a6d3fec56594827d7804964fa70', sinceBlock: 19585299 }
    ]
  }
}

const checkerAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: '_sender',
        type: 'address'
      },
      {
        internalType: 'contract INFT',
        name: '_land',
        type: 'address'
      },
      {
        internalType: 'contract INFT',
        name: '_estate',
        type: 'address'
      },
      {
        internalType: 'int256',
        name: '_x',
        type: 'int256'
      },
      {
        internalType: 'int256',
        name: '_y',
        type: 'int256'
      }
    ],
    name: 'checkLAND',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_sender',
        type: 'address'
      },
      {
        internalType: 'contract IDCLRegistrar',
        name: '_registrar',
        type: 'address'
      },
      {
        internalType: 'string',
        name: '_name',
        type: 'string'
      }
    ],
    name: 'checkName',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'bytes[]',
        name: 'data',
        type: 'bytes[]'
      }
    ],
    name: 'multicall',
    outputs: [
      {
        internalType: 'bool[]',
        name: 'results',
        type: 'bool[]'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'contract ITPRegistry',
        name: '_tpRegistry',
        type: 'address'
      },
      {
        internalType: 'string',
        name: '_tpId',
        type: 'string'
      },
      {
        internalType: 'bytes32',
        name: '_root',
        type: 'bytes32'
      }
    ],
    name: 'validateThirdParty',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_sender',
        type: 'address'
      },
      {
        internalType: 'contract ICollectionFactory[]',
        name: '_factories',
        type: 'address[]'
      },
      {
        internalType: 'contract ICollection',
        name: '_collection',
        type: 'address'
      },
      {
        internalType: 'uint256',
        name: '_itemId',
        type: 'uint256'
      },
      {
        internalType: 'string',
        name: '_contentHash',
        type: 'string'
      },
      {
        internalType: 'contract ICommittee[]',
        name: '_committees',
        type: 'address[]'
      }
    ],
    name: 'validateWearables',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  }
]

export async function createL1Checker(provider: HTTPProvider, network: 'mainnet' | 'goerli'): Promise<L1Checker> {
  const checkerAddress = checkerContracts[network]
  const contracts = l1Contracts[network]

  const requestManager = new RequestManager(provider)
  const factory = new ContractFactory(requestManager, checkerAbi)
  const checker = (await factory.at(checkerAddress)) as any

  const stateOverride = {
    [checkerAddress]: { code }
  }

  async function callMulticallCheckerMethod(args: any, block: number | string) {
    const payload = await checker.multicall.toPayload(args)
    payload.to = checkerAddress
    const call = {
      method: 'eth_call',
      params: [inputCallFormatter(payload), inputBlockNumberFormatter(block), stateOverride]
    }

    const data = toData(await requestManager.sendAsync(call))
    return checker.multicall.unpackOutput(data)
  }

  return {
    async checkLAND(ethAddress: string, parcels: [number, number][], block: number): Promise<boolean[]> {
      const multicallPayload = await Promise.all(
        parcels.map(async ([x, y]) => {
          const payload = checker.checkLAND.toPayload(ethAddress, contracts.landContract, contracts.stateContract, x, y)
          return payload.data
        })
      )

      return callMulticallCheckerMethod(multicallPayload, block)
    },
    async checkNames(ethAddress: string, names: string[], block: number): Promise<boolean[]> {
      const multicallPayload = await Promise.all(
        names.map(async (name) => {
          const payload = await checker.checkName.toPayload(ethAddress, contracts.registrar, name)
          return payload.data
        })
      )

      return callMulticallCheckerMethod(multicallPayload, block)
    }
  }
}

export async function createL2Checker(provider: HTTPProvider, network: 'mumbai' | 'polygon'): Promise<L2Checker> {
  const checkerAddress = checkerContracts[network]
  const requestManager = new RequestManager(provider)
  const factory = new ContractFactory(requestManager, checkerAbi)
  const checker = (await factory.at(checkerAddress)) as any

  const stateOverride = {
    [checkerAddress]: { code }
  }

  const contracts = l2Contracts[network]

  async function callMulticallCheckerMethod(args: any, block: number | string) {
    const payload = await checker.multicall.toPayload(args)
    payload.to = checkerAddress
    const call = {
      method: 'eth_call',
      params: [inputCallFormatter(payload), inputBlockNumberFormatter(block), stateOverride]
    }

    const data = toData(await requestManager.sendAsync(call))
    return checker.multicall.unpackOutput(data)
  }

  async function callCheckerMethod(method: any, args: any[], block: number | string) {
    const payload = await method.toPayload(...args)
    payload.to = checkerAddress

    const call = {
      method: 'eth_call',
      params: [inputCallFormatter(payload), inputBlockNumberFormatter(block), stateOverride]
    }

    const data = toData(await requestManager.sendAsync(call))
    return method.unpackOutput(data)
  }

  return {
    async validateWearables(
      ethAddress: string,
      contractAddress: string,
      assetId: string,
      hashes: string[],
      block: number
    ): Promise<boolean> {
      const factories = contracts.factories
        .filter(({ sinceBlock }) => block >= sinceBlock)
        .map(({ address }) => address)
      const commitees = contracts.commitees
        .filter(({ sinceBlock }) => block >= sinceBlock)
        .map(({ address }) => address)
      const multicallPayload = await Promise.all(
        hashes.map(async (hash) => {
          const payload = checker.validateWearables.toPayload(
            ethAddress,
            factories,
            contractAddress,
            assetId,
            hash,
            commitees
          )
          return payload.data
        })
      )

      const result = (await callMulticallCheckerMethod(multicallPayload, block)) as boolean[]
      return result.some((r) => r)
    },
    async validateThirdParty(tpId: string, root: Buffer, block: number): Promise<boolean> {
      return callCheckerMethod(checker.validateThirdParty, [contracts.thirdParty, tpId, root], block)
    }
  }
}
