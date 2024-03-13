import { ItemChecker, L1Checker, L2Checker } from '@dcl/content-validator'
import { inputBlockNumberFormatter, inputCallFormatter } from './formatters'
import { ContractFactory, HTTPProvider, RequestManager, RPCSendableMessage, toBatchPayload, toData } from 'eth-connect'
import { checkerAbi, l1Contracts, l2Contracts } from '@dcl/catalyst-contracts'
import { code } from '@dcl/catalyst-contracts/dist/checkerByteCode'
import { parseUrn } from '@dcl/urn-resolver'
import { EthAddress } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'

type CollectionItem = {
  contract: string
  nftId: string
}

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

const itemCheckerAbi = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
]

function sendBatch(provider: HTTPProvider, batch: RPCSendableMessage[]) {
  const payload = toBatchPayload(batch)
  return new Promise<any>((resolve, reject) => {
    provider.sendAsync(payload as any, (err: any, result: any) => {
      if (err) {
        reject(err)
        return
      }

      resolve(result)
    })
  })
}

export async function createItemChecker(logs: ILoggerComponent, provider: HTTPProvider): Promise<ItemChecker> {
  const logger = logs.getLogger('item-checker')
  const requestManager = new RequestManager(provider)
  const factory = new ContractFactory(requestManager, itemCheckerAbi)

  async function getOwnerOf(items: CollectionItem[], block: number): Promise<(EthAddress | undefined)[]> {
    const contracts = await Promise.all(items.map((item) => factory.at(item.contract) as any))
    const batch: RPCSendableMessage[] = await Promise.all(
      items.map((item, idx) => contracts[idx].ownerOf.toRPCMessage(item.nftId, block))
    )
    const result = await sendBatch(provider, batch)
    return result.map((r: any, idx: number) => {
      if (!r.result) {
        return undefined
      }
      return contracts[idx].ownerOf.unpackOutput(toData(r.result))?.toLowerCase()
    })
  }

  async function checkItems(ethAddress: string, items: string[], block: number): Promise<boolean[]> {
    const uniqueItems = Array.from(new Set(items))
    const urns = await Promise.all(uniqueItems.map((item) => parseUrn(item)))

    const result = new Map<string, boolean>()
    const filteredItems: CollectionItem[] = []

    for (let i = 0; i < urns.length; ++i) {
      const item = uniqueItems[i]
      const urn = urns[i]
      if (!urn) {
        logger.warn(`Invalid urn ${item}`)
      } else if (urn.type === 'blockchain-collection-v1-asset' || urn.type === 'blockchain-collection-v2-asset') {
        logger.warn(`Found asset, let it pass: ${item}`)
        result.set(item, true) // old deployment, let it pass
      } else if (urn.type === 'blockchain-collection-v1-item' || urn.type === 'blockchain-collection-v2-item') {
        if (!urn.contractAddress) {
          logger.warn(`No contract address found for item: ${item}`)
        } else if (!urn.tokenId) {
          logger.warn(`No tokenId found for item: ${item})`)
          result.set(item, true) // old deployment, let it pass
        } else {
          filteredItems.push({ contract: urn.contractAddress, nftId: urn.tokenId })
        }
      }
    }

    if (filteredItems.length > 0) {
      const owners = await getOwnerOf(filteredItems, block)
      owners.forEach((owner, idx) =>
        result.set(uniqueItems[idx], !!owner && owner.toLowerCase() === ethAddress.toLowerCase())
      )
    }

    return items.map((item) => result.get(item) || false)
  }

  return {
    checkItems
  }
}
