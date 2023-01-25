import {
  checkerAbi,
  checkerContracts,
  collectionFactoryContracts,
  landContracts,
  registrarContracts,
  thirdPartyContracts
} from '@dcl/catalyst-contracts'
import { L1Checker, L2Checker } from '@dcl/content-validator'
import { inputCallFormatter, inputBlockNumberFormatter } from './formatters'
import { RequestManager, HTTPProvider, ContractFactory, toData, BigNumber } from 'eth-connect'
import { code } from './code'
import { ICheckerContract } from 'src/types'

async function callCheckerMethod(
  requestManager: RequestManager,
  checkerAddress: string,
  block: number | string,
  method: any,
  args: any[]
) {
  const payload = await method.toPayload(...args)
  payload.to = checkerAddress

  // TODO: use stateOverride depending on the block
  const stateOverride = {
    [checkerAddress]: { code }
  }
  const call = {
    method: 'eth_call',
    params: [inputCallFormatter(payload), inputBlockNumberFormatter(block), stateOverride]
  }

  const data = toData(await requestManager.sendAsync(call))

  // NOTE(hugo): all methods return boolean
  const value = new BigNumber(data, 16)
  return !value.isZero()
}

export async function createCheckerContract(provider: HTTPProvider, network: string): Promise<ICheckerContract> {
  const checkerAddress = checkerContracts[network]
  const requestManager = new RequestManager(provider)
  const factory = new ContractFactory(requestManager, checkerAbi)
  const checker = (await factory.at(checkerAddress)) as any

  return {
    checkLAND(
      ethAddress: string,
      landAddress: string,
      stateAddress: string,
      x: number,
      y: number,
      block: number
    ): Promise<boolean> {
      return callCheckerMethod(requestManager, checkerAddress, block, checker.checkLAND, [
        ethAddress,
        landAddress,
        stateAddress,
        x,
        y
      ])
    },

    checkName(ethAddress: string, registrar: string, name: string, block: number): Promise<boolean> {
      return callCheckerMethod(requestManager, checkerAddress, block, checker.checkName, [ethAddress, registrar, name])
    },

    validateWearables(
      ethAddress: string,
      factories: string[],
      contractAddress: string,
      assetId: string,
      hash: string,
      block: number
    ): Promise<boolean> {
      return callCheckerMethod(requestManager, checkerAddress, block, checker.validateWearables, [
        ethAddress,
        factories,
        contractAddress,
        assetId,
        hash
      ])
    },

    validateThirdParty(
      ethAddress: string,
      registry: string,
      tpId: string,
      root: Uint8Array,
      block: number
    ): Promise<boolean> {
      return callCheckerMethod(requestManager, checkerAddress, block, checker.validateThirdParty, [
        ethAddress,
        registry,
        tpId,
        root
      ])
    }
  }
}

export async function createL1Checker(provider: HTTPProvider, network: string): Promise<L1Checker> {
  const checker = await createCheckerContract(provider, network)

  return {
    async checkLAND(ethAddress: string, parcels: [number, number][], block: number): Promise<boolean[]> {
      const contracts = landContracts[network]
      try {
        const result = await Promise.all(
          parcels.map(([x, y]) =>
            checker.checkLAND(ethAddress, contracts.landContractAddress, contracts.stateContractAddress, x, y, block)
          )
        )
        return result
      } catch (err) {
        console.log('land', err, ethAddress, parcels, block)
        throw err
      }
    },
    async checkNames(ethAddress: string, names: string[], block: number): Promise<boolean[]> {
      const registrar = registrarContracts[network]
      try {
        const result = await Promise.all(names.map((name) => checker.checkName(ethAddress, registrar, name, block)))
        return result
      } catch (err) {
        console.log('name', err, ethAddress, names, block)
        throw err
      }
    }
  }
}

export async function createL2Checker(provider: HTTPProvider, network: string): Promise<L2Checker> {
  const checker = await createCheckerContract(provider, network)

  const { v2, v3 } = collectionFactoryContracts[network]

  const factories = [v2, v3]
  return {
    async validateWearables(
      ethAddress: string,
      contractAddress: string,
      assetId: string,
      hash: string,
      block: number
    ): Promise<boolean> {
      try {
        const result = await checker.validateWearables(ethAddress, factories, contractAddress, assetId, hash, block)
        return result
      } catch (err) {
        console.log('werables', err, ethAddress, factories, contractAddress, assetId, hash, block)
        throw err
      }
    },
    async validateThirdParty(ethAddress: string, tpId: string, root: Buffer, block: number): Promise<boolean> {
      const registry = thirdPartyContracts[network]
      try {
        const result = await checker.validateThirdParty(ethAddress, registry, tpId, new Uint8Array(root), block)
        if (!result) {
          console.log('INVALID THIRD PARTY', ethAddress, registry, tpId, new Uint8Array(root), { blockTag: block })
        }
        return result
      } catch (err) {
        console.log('tp', err)
        throw err
      }
    }
  }
}
