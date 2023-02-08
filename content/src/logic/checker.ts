import {
  checkerContracts,
  collectionFactoryContracts,
  landContracts,
  registrarContracts,
  thirdPartyContracts
} from '@dcl/catalyst-contracts'
import { L1Checker, L2Checker } from '@dcl/content-validator'
import { inputCallFormatter, inputBlockNumberFormatter } from './formatters'
import { RequestManager, HTTPProvider, ContractFactory, toData } from 'eth-connect'
import { code } from './code'

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
        internalType: 'address',
        name: '_sender',
        type: 'address'
      },
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
        internalType: 'contract ICollection[]',
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

export async function createL1Checker(provider: HTTPProvider, network: string): Promise<L1Checker> {
  const checkerAddress = checkerContracts[network]
  const { landContractAddress, stateContractAddress } = landContracts[network]
  const registrar = registrarContracts[network]

  const requestManager = new RequestManager(provider)
  const factory = new ContractFactory(requestManager, checkerAbi)
  const checker = (await factory.at(checkerAddress)) as any

  const stateOverride = {
    [checkerAddress]: { code }
  }

  async function callMulticallCheckerMethod(args: any, block: number | string) {
    // TODO: use stateOverride depending on the block
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
          const payload = checker.checkLAND.toPayload(ethAddress, landContractAddress, stateContractAddress, x, y)
          return payload.data
        })
      )

      return callMulticallCheckerMethod(multicallPayload, block)
    },
    async checkNames(ethAddress: string, names: string[], block: number): Promise<boolean[]> {
      const multicallPayload = await Promise.all(
        names.map(async (name) => {
          const payload = await checker.checkName.toPayload(ethAddress, registrar, name)
          return payload.data
        })
      )

      return callMulticallCheckerMethod(multicallPayload, block)
    }
  }
}

export async function createL2Checker(provider: HTTPProvider, network: string): Promise<L2Checker> {
  const checkerAddress = checkerContracts[network]
  const requestManager = new RequestManager(provider)
  const factory = new ContractFactory(requestManager, checkerAbi)
  const checker = (await factory.at(checkerAddress)) as any

  const stateOverride = {
    [checkerAddress]: { code }
  }

  const registry = thirdPartyContracts[network]
  const { v2, v3 } = collectionFactoryContracts[network]

  const factories = [v2, v3]

  async function callCheckerMethod(method: any, args: any[], block: number | string) {
    const payload = await method.toPayload(...args)
    payload.to = checkerAddress

    // TODO: use stateOverride depending on the block
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
      hash: string,
      block: number
    ): Promise<boolean> {
      return callCheckerMethod(
        checker.validateWearables,
        [ethAddress, factories, contractAddress, assetId, hash],
        block
      )
    },
    async validateThirdParty(ethAddress: string, tpId: string, root: Buffer, block: number): Promise<boolean> {
      return callCheckerMethod(checker.validateThirdParty, [ethAddress, registry, tpId, root], block)
    }
  }
}
