import { L1Checker, L2Checker } from '@dcl/content-validator'
import { inputCallFormatter, inputBlockNumberFormatter } from './formatters'
import { RequestManager, HTTPProvider, ContractFactory, toData } from 'eth-connect'
import { l1Contracts, l2Contracts, checkerAbi } from '@dcl/catalyst-contracts'
import { code } from '@dcl/catalyst-contracts/dist/checkerByteCode'

export async function createL1Checker(provider: HTTPProvider, network: 'mainnet' | 'sepolia'): Promise<L1Checker> {
  const contracts = l1Contracts[network]

  const requestManager = new RequestManager(provider)
  const factory = new ContractFactory(requestManager, checkerAbi)
  const checker = (await factory.at(contracts.checker)) as any

  const stateOverride = {
    [contracts.checker]: { code }
  }

  async function callMulticallCheckerMethod(args: any, block: number | string) {
    const payload = await checker.multicall.toPayload(args)
    payload.to = contracts.checker
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
          const payload = checker.checkLAND.toPayload(ethAddress, contracts.land, contracts.state, x, y)
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
  const checkerAddress = l2Contracts[network].checker
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
